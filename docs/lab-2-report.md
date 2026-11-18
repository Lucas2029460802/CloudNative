# 实验二报告：场地预约系统 Kubernetes 工作负载编排

《CS30074 云原生软件技术》课程实验二

| 项目     | 内容                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 小组成员 | 彭知书（23300660010）、黄泓力（24340240003）、郑皓名（23340240063） |
| 代码仓库 | <https://github.com/Lucas2029460802/CloudNative>                         |
| 报告日期 | 2026 年 11 月 18 日                                                      |

## 概览

本组把 Lab 1 的场地预约系统从 Docker Compose 迁移到 Kubernetes（minikube 单节点集群），并新增“场地利用率报告”功能。整体设计：

- 无状态的后端 `api`（3 副本）和前端 `web`（2 副本）使用 Deployment，PostgreSQL 使用 StatefulSet 和 PVC。
- 报告由与 API 同一镜像中的工作进程生成：用户手动提交时由 API 创建 Job，CronJob 定时生成，两者共用 CronJob 中的一份 Job 模板。
- Fluent Bit DaemonSet 在每个节点上采集本系统的容器日志。
- 只有 `web` 对集群外开放；API 和数据库只有集群内地址，配置由 ConfigMap 和 Secret 注入。

Lab 1 的五项业务功能在 Kubernetes 上全部可用，48 个端到端测试在 minikube 和 Compose 两种部署上都通过。

实验要求与本报告各节的对应：

| 实验要求 | 本组实现 | 设计 | 验证 |
| -------- | -------- | ---- | ---- |
| Kubernetes 环境、版本、节点、镜像使用方式 | minikube v1.39.0，Kubernetes v1.37.0，单节点；本地构建后 `minikube image load` | 1.1、1.2 | 1.3 |
| 保留 Lab 1 的五项业务功能 | 同一套 API 和前端迁移到 Kubernetes | 2.1 | 3.1、3.2、3.11 |
| 使用并说明 Deployment 和 StatefulSet | `api`、`web` 为 Deployment，`postgres` 为 StatefulSet | 2.2、2.3 | 1.3 |
| Service，组件间不依赖 Pod IP，不暴露数据库 | NodePort `web`、ClusterIP `api`、Headless `postgres` | 2.4 | 3.9 |
| ConfigMap 与 Secret | `app-config`、`fluent-bit-config`；`postgres-credentials` | 2.5 | 3.8 |
| 持久化存储 | StatefulSet 的 `volumeClaimTemplates`，StorageClass `standard` | 2.6 | 3.7 |
| 多副本、请求分布证据、副本数依据 | `api` 3 副本，响应头 `X-Served-By` 标识处理请求的 Pod | 2.7 | 3.3 |
| 一次性报告 Job：唯一标识、状态、结果可查询 | API 创建 Job，报告编号与 Job 名称相互关联 | 2.8、2.9 | 3.4、3.10 |
| 定时 CronJob：生产周期，避免重叠和重复写入 | `venue-report`，演示时每 2 分钟，生产建议每天 00:05 | 2.10 | 3.5 |
| DaemonSet：每个符合条件的节点一个 Pod | Fluent Bit 采集各节点的容器日志 | 2.11 | 3.6 |

## 1. 实验环境介绍

### 1.1 环境与版本

| 项目            | 内容                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| 操作系统        | Windows 11 Pro（10.0.26200），Docker Desktop（Docker Engine 29.9.3，WSL 2 后端） |
| Kubernetes 环境 | minikube v1.39.0，docker 驱动，单节点，容器运行时 containerd 2.3.4               |
| Kubernetes 版本 | 服务端 v1.37.0；kubectl v1.37.1，内置 Kustomize v5.8.1                           |
| 节点数量        | 1（节点 `minikube`，同时承担控制面和工作负载）                                   |
| StorageClass    | `standard`（默认），制备器 `k8s.io/minikube-hostpath`                            |
| 命名空间        | `venue-booking`，本实验的全部资源都在其中                                        |
| 部署工具        | YAML 清单 + Kustomize（`kubectl apply -k deploy/k8s`）                           |

```text
$ kubectl get nodes -o wide
NAME       STATUS   ROLES           AGE   VERSION   INTERNAL-IP    EXTERNAL-IP   OS-IMAGE                         KERNEL-VERSION                              CONTAINER-RUNTIME
minikube   Ready    control-plane   66m   v1.37.0   192.168.49.2   <none>        Debian GNU/Linux 12 (bookworm)   6.18.58.1-microsoft-standard-WSL2 (amd64)   containerd://2.3.4

$ kubectl get storageclass
NAME                 PROVISIONER                RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
standard (default)   k8s.io/minikube-hostpath   Delete          Immediate           false                  66m
```

节点 `minikube` 是 Docker Desktop 中的一个容器，内核来自 WSL 2。按 `kubectl describe node`，它可分配 24 个 CPU、约 27.4 GiB 内存、最多 110 个 Pod，Pod 网段为 `10.244.0.0/24`。

### 1.2 镜像与部署方式

两个应用镜像沿用 Lab 1 的 Dockerfile，不经过镜像仓库：

- 在主机 Docker 中构建 `venue-booking/api:2.0.0` 和 `venue-booking/frontend:2.0.0`，再用 `minikube image load` 装入节点（节点使用 containerd，看不到主机 Docker 的镜像）。清单使用 `imagePullPolicy: IfNotPresent`。
- 报告任务与 API 共用同一个镜像，入口分别是 `dist/report.js` 和 `dist/server.js`。
- 镜像标签只在 `kustomization.yaml` 中写一次。每次重新构建都换新标签，Pod 模板随之变化，Deployment 才会滚动更新。
- `postgres:18.6-alpine3.24` 和 `fluent/fluent-bit:5.1.5` 固定到确切版本，由节点自行拉取。

部署与访问（仓库根目录，Git Bash；完整说明见 `deploy/k8s/README.md`）：

```bash
minikube start
IMAGE_TAG=2.0.0 docker compose build api frontend
minikube image load venue-booking/api:2.0.0 venue-booking/frontend:2.0.0

cp deploy/k8s/secret.env.example deploy/k8s/secret.env   # 修改其中的密码；该文件被 Git 忽略
kubectl apply -k deploy/k8s
kubectl -n venue-booking rollout status deploy/api deploy/web sts/postgres

minikube service web -n venue-booking --url   # 打开访问入口，保持该终端打开
kubectl delete -k deploy/k8s                  # 清理：连同 PVC 和数据一起删除
```

只有前端 Service `web` 是 NodePort。docker 驱动下节点 IP `192.168.49.2` 位于 Docker Desktop 的内部网络，Windows 主机路由不到，所以用 `minikube service` 建立隧道。本次实验的地址为 `http://127.0.0.1:57385`，第 3 节的请求都经过这个地址。

### 1.3 命名空间资源列表

部署 43 秒后，全部 Pod 一次就绪，重启次数为 0：

```text
$ kubectl -n venue-booking get deploy,sts,ds,cronjob,job,pod,svc,endpointslice,cm,secret,pvc,sa,role,rolebinding -o wide
NAME                  READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                         SELECTOR
deployment.apps/api   3/3     3            3           43s   api          venue-booking/api:2.0.0        app.kubernetes.io/name=api
deployment.apps/web   2/2     2            2           43s   web          venue-booking/frontend:2.0.0   app.kubernetes.io/name=web

NAME                        READY   AGE   CONTAINERS   IMAGES
statefulset.apps/postgres   1/1     43s   postgres     postgres:18.6-alpine3.24

NAME                        DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE   CONTAINERS   IMAGES                    SELECTOR
daemonset.apps/fluent-bit   1         1         1       1            1           kubernetes.io/os=linux   42s   fluent-bit   fluent/fluent-bit:5.1.5   app.kubernetes.io/name=fluent-bit

NAME                         SCHEDULE      TIMEZONE        SUSPEND   ACTIVE   LAST SCHEDULE   AGE   CONTAINERS   IMAGES                    SELECTOR
cronjob.batch/venue-report   */2 * * * *   Asia/Shanghai   False     0        <none>          42s   report       venue-booking/api:2.0.0   <none>

NAME                       READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
pod/api-c8779bc78-6rkp8    1/1     Running   0          43s   10.244.0.23   minikube   <none>           <none>
pod/api-c8779bc78-8zsfk    1/1     Running   0          43s   10.244.0.25   minikube   <none>           <none>
pod/api-c8779bc78-927mc    1/1     Running   0          43s   10.244.0.24   minikube   <none>           <none>
pod/fluent-bit-2tvks       1/1     Running   0          42s   10.244.0.27   minikube   <none>           <none>
pod/postgres-0             1/1     Running   0          42s   10.244.0.26   minikube   <none>           <none>
pod/web-6b8dc596d7-kjk57   1/1     Running   0          43s   10.244.0.22   minikube   <none>           <none>
pod/web-6b8dc596d7-p4ztn   1/1     Running   0          43s   10.244.0.21   minikube   <none>           <none>

NAME               TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE   SELECTOR
service/api        ClusterIP   10.100.232.44   <none>        3000/TCP         43s   app.kubernetes.io/name=api
service/postgres   ClusterIP   None            <none>        5432/TCP         43s   app.kubernetes.io/name=postgres
service/web        NodePort    10.106.130.55   <none>        8080:31975/TCP   43s   app.kubernetes.io/name=web
……
NAME                                    STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE   VOLUMEMODE
persistentvolumeclaim/data-postgres-0   Bound    pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            standard       <unset>                 43s   Filesystem
……
```

此时 CronJob 还没到第一个调度时刻，所以没有 Job。ConfigMap、Secret 和 RBAC 资源的内容见第 3.8 和 3.10 节。

## 2. Lab2 系统架构与组件

### 2.1 系统架构图

![Lab 2 系统架构图](report-assets/diagrams/lab2-architecture.png)

图 1 Lab 2 系统架构。实线是请求或数据流向，虚线是配置注入。

图中三条链路：

- 用户请求：浏览器经隧道进入 NodePort Service `web`，nginx 把 `/api/*` 转发到 ClusterIP Service `api`，API 再通过 Headless Service `postgres` 访问 `postgres-0`。
- 报告任务：手动报告由 API 调用 kube-apiserver 创建 Job，定时报告由 CronJob `venue-report` 创建 Job。两种 Job 运行同一个 `node dist/report.js`，结果写回 PostgreSQL。
- 日志采集：DaemonSet `fluent-bit` 在每个节点上以只读 hostPath 读取容器日志，补充 Pod 元数据后输出。

与 Lab 1 的对应关系：

| Lab 1（Docker Compose）                          | Lab 2（Kubernetes）                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 服务 `frontend`，发布主机端口 8080               | Deployment `web`（2 副本）+ NodePort Service `web`                           |
| 服务 `api`，不发布端口                           | Deployment `api`（3 副本）+ ClusterIP Service `api`                          |
| 服务 `database` + 命名卷 `database-data`         | StatefulSet `postgres` + Headless Service `postgres` + PVC `data-postgres-0` |
| `.env` 注入环境变量                              | ConfigMap `app-config` + Secret `postgres-credentials`                       |
| `frontend-net`、`backend-net` 两个网络隔离数据库 | 只有 `web` 对集群外开放，`api` 和 `postgres` 只有集群内地址                  |
| 无                                               | CronJob 和 Job（利用率报告）、DaemonSet（日志采集）、ServiceAccount 与 RBAC  |

Compose 部署方式也保留。Compose 环境没有 Kubernetes API，报告在 API 进程内直接计算（`REPORT_RUNNER=inline`），同一套代码在两种环境下都通过全部端到端测试。

### 2.2 Kubernetes 资源列表

| 资源类型 | 本组资源名称 | 承载的组件或任务 | 说明 |
| -------- | ------------ | ---------------- | ---- |
| Deployment | `api`（3 副本） | 后端 REST API（Node.js，端口 3000） | 无状态，数据全部在 PostgreSQL 中，可以水平扩展。使用 ServiceAccount `api` 调用 Kubernetes API 创建报告 Job。滚动更新 `maxUnavailable: 0`、`maxSurge: 1` |
| Deployment | `web`（2 副本） | 前端 nginx（端口 8080）：静态资源和 `/api` 反向代理 | 无状态。2 个副本保证滚动更新或单个 Pod 故障时入口不中断 |
| StatefulSet | `postgres`（1 副本，Pod `postgres-0`） | PostgreSQL 18.6 数据库 | 需要稳定的 Pod 名称和与之绑定的存储，`volumeClaimTemplates` 为它创建 PVC。单写入者，不做多副本 |
| Job | `venue-report-manual-<报告编号>-<5 位随机串>`，如 `venue-report-manual-2-6a6b8` | 用户在页面或 API 上手动触发的一次性利用率报告 | 由 API 按 CronJob 的 `jobTemplate` 创建，运行一次后结束。Job 名称保存在报告记录的 `jobName` 字段中 |
| Job | `venue-report-<调度时间>`，如 `venue-report-29907062` | CronJob 每次调度产生的报告任务 | 由 CronJob 控制器创建，后缀是调度时刻（自 Unix 纪元起的分钟数） |
| CronJob | `venue-report` | 定时生成从当天起 7 天的利用率报告 | 演示周期 `*/2 * * * *`，`timeZone: Asia/Shanghai`，`concurrencyPolicy: Forbid`。它的 `jobTemplate` 也是手动 Job 的模板 |
| DaemonSet | `fluent-bit` | 节点级日志采集（Fluent Bit 5.1.5） | 每个节点运行一个 Pod，读取该节点上本命名空间所有容器的日志 |
| Service | `web`（NodePort，8080:31975） | 前端入口 | 唯一对集群外开放的 Service |
| Service | `api`（ClusterIP，3000） | 后端 API | 供集群内的 `web` 访问，并在 3 个 API Pod 之间分发连接 |
| Service | `postgres`（Headless，5432） | 数据库 | StatefulSet 的 `serviceName`，为 `postgres-0` 提供稳定 DNS 名称，不对集群外开放 |
| ConfigMap | `app-config-<hash>` | API、报告任务和数据库的非敏感配置 | 由 `config.env` 生成，共 7 个键 |
| ConfigMap | `fluent-bit-config-<hash>` | Fluent Bit 的采集管道配置 | 由 `fluent-bit-pipeline.yaml` 生成，以文件形式挂载 |
| Secret | `postgres-credentials-<hash>` | 数据库用户名和密码 | 由被 Git 忽略的 `secret.env` 生成，仓库里只有 `secret.env.example` |
| PVC | `data-postgres-0`（1Gi，RWO，StorageClass `standard`） | PostgreSQL 数据目录 | 由 `volumeClaimTemplates` 创建，Pod 重建后重新挂载同一个卷 |

此外还有 Namespace `venue-booking`、ServiceAccount `api`、Role `report-launcher` 和同名 RoleBinding（第 2.9 节）。

### 2.3 工作负载类型的选择

按“是否持续运行、是否有状态、运行几次、在哪里运行”给每个组件选择工作负载：

| 组件或任务 | 运行特征 | 工作负载 | 理由 |
| ---------- | -------- | -------- | ---- |
| `api` | 持续运行，无状态 | Deployment | 各副本完全等价，可以任意替换、增减和滚动更新，不需要固定名称，也不需要自己的存储 |
| `web` | 持续运行，无状态 | Deployment | nginx 只提供镜像内的静态文件并转发 `/api`，同样可以任意替换 |
| `postgres` | 持续运行，有状态 | StatefulSet | 需要稳定身份和持久化存储：Pod 重建后仍叫 `postgres-0`，并挂回同一个 PVC。Deployment 的 Pod 名称随机，多个副本还会争用同一个卷 |
| 手动报告 | 运行一次就结束 | Job | 一份报告是有终点的计算：读数据、聚合、写结果、退出。Job 记录成功或失败，计算与 API 的请求处理隔离，各有自己的资源限制 |
| 定时报告 | 按周期重复运行 | CronJob | 由集群按 cron 表达式创建 Job，并负责防重叠和历史清理。API 有 3 个副本，若在进程内放定时器会重复触发 3 次 |
| 日志采集 | 每个节点都要有一份 | DaemonSet | 容器日志在各节点本地的 `/var/log` 下，只有运行在该节点上的 Pod 才能通过 hostPath 读到。节点增减时由 DaemonSet 自动补齐或回收 |

数据库迁移沿用 Lab 1 的做法：API 启动时在 PostgreSQL 咨询锁保护下执行，3 个副本同时启动也只有一个在执行。

PostgreSQL 的副本数固定为 1：它是单写入者，增加 StatefulSet 副本只会得到几个互不相干的空数据库，多副本需要另外配置流复制。

Fluent Bit 用 `nodeSelector: kubernetes.io/os=linux` 限定 Linux 节点，并容忍 `node-role.kubernetes.io/control-plane:NoSchedule` 污点，在多节点集群的控制面节点上也能运行。

### 2.4 Service 的设置

| 组件 | 是否需要 Service | 类型 | 理由 |
| ---- | ---------------- | ---- | ---- |
| `web` | 需要 | NodePort | 用户从集群外访问的入口。`web` 里的 nginx 已经承担 `/api` 路由，所以不再加 Ingress |
| `api` | 需要 | ClusterIP | `web` 需要一个不随 Pod 变化的地址，并把请求分给 3 个副本。浏览器只访问 `web` 的同源 `/api`，API 不需要对集群外开放 |
| `postgres` | 需要 | Headless（`clusterIP: None`） | API 和报告任务通过名称 `postgres` 连接。只有一个实例，不需要负载均衡；同时是 StatefulSet 的 `serviceName`，提供 `postgres-0.postgres` 这一固定名称 |
| 报告 Job、CronJob | 不需要 | 无 | 只主动连接数据库，没有组件访问它们 |
| `fluent-bit` | 不需要 | 无 | 只读取本节点的日志文件，没有入站流量 |

组件之间一律使用 Service 的 DNS 名称：

- nginx 的上游是 `http://api.venue-booking.svc.cluster.local:3000`。nginx 的 `resolver` 不使用 `/etc/resolv.conf` 的搜索域，短名称 `api` 解析不到，所以写完整域名。模板中用变量形式的 `proxy_pass`，每个请求重新解析（缓存 10 秒）。
- API 和报告任务的连接串是 `postgres://…@postgres:5432/venue_booking`，主机名是 Service 名。

第 3.7 节中 `postgres-0` 被删除重建，Pod IP 从 `10.244.0.26` 变为 `10.244.0.30`，名称 `postgres` 解析到新地址，API 不需要改动或重启。

### 2.5 ConfigMap 和 Secret 的内容边界与引用方式

边界：泄露后能直接访问数据的值放进 Secret，其余放进 ConfigMap。

| 资源 | 键 | 使用者 |
| ---- | --- | ------ |
| ConfigMap `app-config` | `PORT`、`APP_TIME_ZONE`、`DB_SEED_ON_START`、`POSTGRES_DB`、`REPORT_RUNNER`、`REPORT_CRONJOB_NAME`、`REPORT_WINDOW_DAYS` | `api` 和报告任务通过 `envFrom` 全部读入；`postgres` 用 `configMapKeyRef` 只取 `POSTGRES_DB` |
| ConfigMap `fluent-bit-config` | 文件 `fluent-bit.yaml` | `fluent-bit` 以卷的形式挂载到 `/fluent-bit/config` |
| Secret `postgres-credentials` | `POSTGRES_USER`、`POSTGRES_PASSWORD` | `postgres`、`api` 和报告任务通过 `envFrom` 读入 |

`api` 和报告任务的引用方式：

```yaml
envFrom:
  - configMapRef:
      name: app-config
  - secretRef:
      name: postgres-credentials
env:
  # $(VAR) is expanded from the envFrom values.
  - name: DATABASE_URL
    value: postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)
  - name: NODE_EXTRA_CA_CERTS
    value: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
```

- 应用只读取 `DATABASE_URL` 一个变量（与 Lab 1 相同）。清单用 Kubernetes 的 `$(VAR)` 语法在容器启动时拼出连接串，密码不出现在任何清单或 ConfigMap 里，应用代码也不需要为 Kubernetes 改动。
- Secret 由 Kustomize 的 `secretGenerator` 从 `secret.env` 生成。该文件被 `.gitignore` 忽略，也被 `.dockerignore` 排除在镜像之外；仓库只提交带占位密码的 `secret.env.example`。
- 两个生成器都在资源名后加内容哈希（如 `app-config-5tdtccbhm6`），并自动改写工作负载中的引用。修改配置后重新 `apply`，Pod 模板随之变化并触发滚动更新，进程不会继续使用旧值。
- PostgreSQL 只在初始化空数据目录时读取 `POSTGRES_PASSWORD`，之后修改密码需要执行 `ALTER ROLE`（写在部署说明中）。

### 2.6 PVC 与存储方案

需要持久化的只有 PostgreSQL 的数据目录。`web` 和 `api` 不保存数据，报告结果也写在数据库的 `reports` 表里，报告 Job 不需要卷。

```yaml
# deploy/k8s/postgres.yaml（节选）
          volumeMounts:
            # PostgreSQL 18+ keeps data in /var/lib/postgresql/<major>/docker.
            - name: data
              mountPath: /var/lib/postgresql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: standard
        resources:
          requests:
            storage: 1Gi
```

- StorageClass `standard` 由 `k8s.io/minikube-hostpath` 在节点文件系统上动态创建 PV，PVC 创建后立即绑定，不需要手工准备 PV。
- `ReadWriteOnce` 与单实例数据库一致，1Gi 对演示数据足够。
- 挂载点是 `/var/lib/postgresql`：PostgreSQL 18 的官方镜像把数据放在 `/var/lib/postgresql/18/docker`，挂到旧版本的 `/var/lib/postgresql/data` 会让数据落在容器的可写层，重建后丢失。
- `fsGroup: 70` 让卷对镜像内的 `postgres` 用户（uid 70）可写，容器不需要以 root 启动。
- PVC 的生命周期独立于 Pod：删除 `postgres-0` 后，重建的同名 Pod 挂回 `data-postgres-0`，数据仍在（第 3.7 节）。`kubectl delete -k deploy/k8s` 删除整个命名空间，PVC 和数据随之删除。

### 2.7 副本数设计

| 组件 | 副本数 | 依据 |
| ---- | ------ | ---- |
| `api` | 3 | 无状态：进程内不保存会话或缓存，预约冲突由数据库的排他约束和行锁判定，与请求落在哪个副本无关。3 个副本在滚动更新和单个 Pod 故障时仍有多个实例服务 |
| `web` | 2 | 无状态，只提供静态文件和转发，单个请求的开销远小于 API，2 个副本已能保证更新和故障期间入口不中断 |
| `postgres` | 1 | 有状态且单写入者，多副本需要主从复制和故障切换，PVC 又是 `ReadWriteOnce` |
| 报告 Job | 每次 1 个 Pod | 一次聚合查询，不需要并行 |
| `fluent-bit` | 每节点 1 个 | 由节点数决定，不由负载决定 |

API 的水平扩展有两处配套设计：

- API 副本里没有后台循环。未结束的报告在被查询时才核对 Job 状态（第 2.9 节的“查询时对账”），副本之间不需要选主，也不会重复做同一件事。
- 存活探针用 `tcpSocket`，就绪探针和启动探针用 `/api/health`（内部执行 `select 1`）。数据库短暂不可用时，API Pod 只是被摘出 Service，不会被成批重启。

请求如何分到多个副本：nginx 对上游使用短连接，每个请求新建一条到 Service `api` 的 TCP 连接，kube-proxy 按连接在 3 个端点之间选择。API 在每个 `/api/*` 响应上加 `X-Served-By: <Pod 名>` 头，请求日志里也带同一字段。第 3.3 节中 30 个请求在三个 Pod 上的分布为 11、9、10。

所有容器都设置了 CPU 和内存请求以及内存上限：

| 容器            | 请求（CPU / 内存） | 内存上限 |
| --------------- | ------------------ | -------- |
| `api`、`report` | 50m / 96Mi         | 256Mi    |
| `web`           | 10m / 32Mi         | 64Mi     |
| `postgres`      | 100m / 256Mi       | 512Mi    |
| `fluent-bit`    | 20m / 32Mi         | 64Mi     |

### 2.8 利用率报告：数据模型与接口

报告统计指定日期范围内各场地的预约次数和累计预约时长：

- 只统计 `confirmed` 的预约，已取消的不计入；
- 日期范围首尾都包含，按预约日期判断。预约不跨天，不需要按范围裁剪时长；
- 结果包含所有场地，没有预约的场地记为 0；
- 一份报告最多覆盖 366 天，由接口校验和数据库检查约束同时限制。

聚合是一条 SQL：

```sql
select v.id, v.name,
       count(r.id)::int,
       coalesce(sum(extract(epoch from (r.end_time - r.start_time)) / 60), 0)::int
from venues v
left join reservations r
  on r.venue_id = v.id and r.status = 'confirmed' and r.reservation_date between $1 and $2
group by v.id
order by v.id
```

新增的 `reports` 表（只新增，不改动已有表）：

| 列                          | 含义                         | 类型             | 约束                                                               |
| --------------------------- | ---------------------------- | ---------------- | ------------------------------------------------------------------ |
| `id`                        | 报告编号                     | `integer`        | 主键，自增                                                         |
| `trigger`                   | 触发方式                     | `report_trigger` | 非空；`manual` 或 `scheduled`                                      |
| `from_date`、`to_date`      | 统计范围（含首尾）           | `date`           | 非空；`CHECK (to_date >= from_date and to_date - from_date < 366)` |
| `status`                    | 状态                         | `report_status`  | 非空，默认 `pending`；另有 `running`、`succeeded`、`failed`        |
| `job_name`                  | 执行它的 Kubernetes Job 名称 | `varchar(63)`    | 可空（进程内执行时为空），`UNIQUE`                                 |
| `created_at`                | 提交时间                     | `timestamptz`    | 非空，默认 `now()`                                                 |
| `started_at`、`finished_at` | 开始和结束时间               | `timestamptz`    | 可空                                                               |
| `error`                     | 失败原因                     | `text`           | 可空                                                               |
| `results`                   | 结果快照                     | `jsonb`          | 可空，成功后与状态一起原子写入                                     |

部分唯一索引 `reports_scheduled_period_idx (from_date, to_date) WHERE trigger = 'scheduled'` 保证同一个统计区间只有一条定时报告。

报告有两个相互关联的唯一标识：数据库里的报告编号 `id` 和 Kubernetes 里的 Job 名称。手动 Job 的名称里带有报告编号，Job 上有标签 `venue-booking/report-id=<编号>`，报告行的 `job_name` 记录 Job 名称。

接口（定义在前后端共用的 `packages/contracts`）：

| 方法与路径 | 作用 | 成功响应 | 错误 |
| ---------- | ---- | -------- | ---- |
| `POST /api/reports` | 请求生成报告，请求体 `{from, to}` | 202 和报告对象（Kubernetes 上状态为 `pending`） | 400 `BAD_REQUEST`（日期不合法、范围颠倒或超过 366 天），503 `REPORT_RUNNER_UNAVAILABLE` |
| `GET /api/reports` | 最近 50 份报告，新的在前 | 200 和数组 | 无 |
| `GET /api/reports/{id}` | 查询一份报告及其结果 | 200 和报告对象 | 404 `REPORT_NOT_FOUND` |

前端新增“利用率报告”页面（`/reports`）：选择起止日期并提交，下方列出最近的报告及其状态、触发方式、统计范围、执行方（Job 名称）和时间，选中一份后显示各场地的预约数和已预约时长。列表中有未结束的报告时，页面每 2 秒刷新一次。

### 2.9 手动报告 Job 的生命周期

![手动报告的状态变化](report-assets/diagrams/lab2-job-lifecycle.png)

图 2 手动报告的状态变化。任一步失败时报告行写为 `failed` 并记录 `error`，工作进程以退出码 1 结束，Job 记为 Failed。

#### 触发与 Job 的创建

`POST /api/reports` 的处理：

1. 在一个事务里插入报告行，同时生成 Job 名称 `venue-report-manual-<报告编号>-<5 位随机十六进制>` 写入 `job_name`。名称在调用 Kubernetes 之前就已落库，之后无论创建成功、超时还是 API 崩溃，都能凭它查到 Job 是否存在。随机后缀避免数据库清空后编号重新从 1 开始时与残留的 Job 重名。
2. 读取 CronJob `venue-report`，复制其 `spec.jobTemplate.spec`，向容器 `report` 追加环境变量 `REPORT_ID`，加上标签 `venue-booking/report-id`，以预先确定的名称创建 Job。镜像、资源限制、安全上下文、`backoffLimit` 等只在 CronJob 清单里定义一次，手动和定时两种 Job 不会出现配置漂移。
3. 创建返回 409（同名 Job 已存在）视为已创建。其他错误或超时时再查一次该 Job：存在则正常返回，不存在才把报告行标为 `failed` 并返回 503。
4. 返回 202 和 `pending` 状态的报告对象，客户端轮询 `GET /api/reports/{id}`。

手动 Job 不设置 `ownerReferences`。`kubectl create job --from=cronjob/…` 会把 CronJob 设为属主，手动 Job 就会被计入 `concurrencyPolicy: Forbid` 的判断和历史保留上限，挤掉或阻塞定时任务。

API 直接用 Node.js 的 `fetch` 调用 Kubernetes REST API：每次调用都重新读取挂载的 ServiceAccount 令牌（令牌会轮换），集群 CA 通过 `NODE_EXTRA_CA_CERTS` 加入信任，请求超时 5 秒。

#### RBAC

```yaml
# deploy/k8s/api.yaml（节选）
kind: Role
metadata:
  name: report-launcher
rules:
  - apiGroups: [batch]
    resources: [cronjobs]
    resourceNames: [venue-report]
    verbs: [get]
  - apiGroups: [batch]
    resources: [jobs]
    verbs: [create, get]
```

权限只有三项，对应上面的三个调用：读取 CronJob `venue-report`、创建 Job、读取 Job。Role 通过 RoleBinding 只授予 ServiceAccount `api`。报告任务本身不访问 Kubernetes API，它的 Job 名称由 Downward API 从 Pod 标签 `batch.kubernetes.io/job-name` 注入 `JOB_NAME`，所以除 API 外的所有 Pod 都设置了 `automountServiceAccountToken: false`。

#### 工作进程

`dist/report.js` 等待数据库可连接，带 `REPORT_ID` 时执行该编号的手动报告，否则执行定时报告，最后打印 `Report <编号>: <状态>`，状态不是 `succeeded` 时退出码为 1。执行分两个事务：

- 事务 1 用 `SELECT … FOR UPDATE` 锁定报告行，只有 `job_name` 与本进程的 `JOB_NAME` 一致且状态为 `pending` 时，才写入 `running` 和 `started_at` 并提交。单独提交这一步，其他连接才能看到“已开始”。
- 事务 2 再次锁定并核对，执行聚合，然后写入 `results`、`succeeded` 和 `finished_at`。聚合出错时回滚到保存点，同一事务内把行写为 `failed`。
- 时间用 `clock_timestamp()` 取实际时刻，不用事务开始时间 `now()`。
- 同一个 Job 被重复执行时（Kubernetes 不保证恰好一次），第二个进程发现状态已不是 `pending`，直接返回，不会覆盖已完成的结果。

#### 失败与卡住的处理

- `backoffLimit: 0`：工作进程失败一次 Job 就失败，不重试，Job 状态与报告行状态一一对应。用户可以重新提交。
- `activeDeadlineSeconds: 120`：Job 最多运行 2 分钟，超时由 Kubernetes 终止，所以每个 Job 一定会结束。
- `ttlSecondsAfterFinished: 3600`：结束 1 小时后 Job 及其 Pod 自动删除。
- 查询时对账：Pod 被强行杀掉时，报告会停在 `pending` 或 `running`。`GET /api/reports` 和 `GET /api/reports/{id}` 返回前，对每条未结束的报告查询对应的 Job：Job 带 `Failed=True` 条件，或 Job 不存在且报告已提交超过 60 秒，就把报告标为 `failed`。更新语句带 `job_name` 和状态条件，工作进程恰好在此时完成，或定时报告行已被新 Job 接管时，不会把别人的结果改成失败。

### 2.10 定时报告 CronJob

| 字段                                                   | 取值            | 作用                                             |
| ------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `schedule`                                             | `*/2 * * * *`   | 演示时每 2 分钟一次，便于观察                    |
| `timeZone`                                             | `Asia/Shanghai` | 调度按业务时区解释，与 `APP_TIME_ZONE` 一致      |
| `concurrencyPolicy`                                    | `Forbid`        | 上一次的 Job 还没结束时跳过本次调度              |
| `startingDeadlineSeconds`                              | 60              | 错过调度时刻超过 60 秒就放弃这一次，等下一个周期 |
| `successfulJobsHistoryLimit`、`failedJobsHistoryLimit` | 3、3            | 各保留最近 3 个 Job 供查看日志                   |
| `jobTemplate` 中的 `backoffLimit`                      | 0               | 失败不重试，与手动 Job 相同                      |
| `activeDeadlineSeconds`、`ttlSecondsAfterFinished`     | 120、3600       | 限定运行时长和保留时间                           |

统计窗口是“从今天起的 7 天”（`REPORT_WINDOW_DAYS`），“今天”按 `APP_TIME_ZONE` 计算。系统不允许预约过去的时间，向前看的窗口对场地管理更有用。

生产环境建议的周期是 `5 0 * * *`（`Asia/Shanghai`），即每天 00:05 运行一次：窗口按天滚动，一天一份就够；留出 5 分钟，避开日期切换的瞬间。

避免任务重叠、重复写入和并发冲突的措施分四层：

1. 调度层：`concurrencyPolicy: Forbid` 保证两次运行不重叠，`activeDeadlineSeconds` 保证卡住的 Job 会被终止，不会一直挡住后面的调度。
2. 唯一键：部分唯一索引以统计区间 `(from_date, to_date)` 作为定时报告的周期键。工作进程用 `INSERT … ON CONFLICT … DO UPDATE` 写入，同一区间的再次运行更新同一行，不会产生重复记录（第 3.5 节中运行 4 次只有一条定时报告）。
3. 行锁：执行阶段的两个事务都先 `SELECT … FOR UPDATE` 锁定报告行，同一行上的并发执行被串行化。
4. 以 `job_name` 为条件的更新：同一个 Job 被重复启动时不会清空已完成的结果；旧 Job 的进程或对旧 Job 的对账也不会改动已被新 Job 接管的行。

手动报告每次插入新行，与定时报告互不影响。

### 2.11 Fluent Bit 日志采集

- 输入：`tail` 只读取 `/var/log/containers/*_venue-booking_*.log`，即本命名空间的容器日志，并排除 Fluent Bit 自己的日志，避免输出被自己读入形成循环。`multiline.parser: cri` 解析 containerd 的日志格式。
- 元数据：`tag: kube.*` 让标签带上完整文件路径，`kubernetes` 过滤器开启 `use_tag_for_meta` 后直接从文件名解析出 Pod 名、命名空间和容器名，不调用 Kubernetes API。因此这个 DaemonSet 没有 ServiceAccount 令牌，也不需要 Role。
- 短命 Pod：报告 Job 的 Pod 只运行几秒。`refresh_interval: 5` 让新文件在 5 秒内被发现（默认 60 秒），`read_from_head: true` 让新文件从头读起，这类 Pod 的日志不会漏掉。
- 输出：每条日志以一行 JSON 写到标准输出，用 `kubectl logs ds/fluent-bit` 查看。生产环境可改为输出到 Loki 或 OpenSearch。
- 挂载与权限：节点的 `/var/log` 以 hostPath 只读挂载。容器日志文件属于 root、权限 0640，所以该容器以 uid 0 运行，其余方面全部收紧：根文件系统只读，丢弃全部 capabilities，禁止提权，使用 `RuntimeDefault` seccomp。

### 2.12 安全设计

- 非 root 运行：`api` 和报告任务以 uid 1000、`web` 以 uid 101、`postgres` 以 uid 70 运行，清单用数字 uid 配合 `runAsNonRoot: true`。唯一的例外是 Fluent Bit（见上一节）。
- 所有容器都设置 `allowPrivilegeEscalation: false`、`capabilities.drop: [ALL]` 和 `RuntimeDefault` seccomp。
- 只有 `api` 的 Pod 挂载 ServiceAccount 令牌，且权限限定为第 2.9 节的三项。
- 只有 `web` 对集群外开放；数据库只有集群内的 Headless Service。
- `POST /api/reports` 沿用 Lab 1 的无登录设计，任何能访问前端的人都能触发报告 Job。单个 Job 的影响由 `activeDeadlineSeconds`、内存上限和 TTL 限定；生产环境应再加上认证与限流，并用 ResourceQuota 限制命名空间内的 Job 数量。

## 3. 系统使用报告

以下记录来自 2026 年 11 月 12 日 02:54 至 03:05（东八区）在 minikube 集群上的一次完整部署，请求都经过第 1.2 节的隧道地址 `http://127.0.0.1:57385`，原始输出保存在 `docs/report-assets/lab2/`。代码块中的“……”表示省略的行，`#` 开头的中文行是说明。API 返回的时间戳为 UTC，加 8 小时即东八区时间。

### 3.1 Lab 1 业务流程在 Kubernetes 上的运行

请求路径为 `curl` → 隧道 → Service `web` → nginx → Service `api` → API Pod → `postgres-0`。每一步的响应状态行、`x-served-by` 头和 JSON 摘录如下：

```text
# 1. 查询场地列表（GET /api/venues）：返回启动时写入的 6 个演示场地
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-6rkp8
[
  {
    "id": 1,
    "name": "Aurora Lecture Hall",
……
]

# 2. 查询场地详情（GET /api/venues/1）
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-927mc
{
  "id": 1,
  "name": "Aurora Lecture Hall",
……
}

# 3. 创建场地（POST /api/venues）：得到场地 7
HTTP/1.1 201 Created
x-served-by: api-c8779bc78-8zsfk
{
  "id": 7,
  "name": "Lab 2 Demo Room",
……
}

# 4. 创建预约（POST /api/reservations）：场地 1，11 月 13 日 09:00–10:30，得到预约 1
HTTP/1.1 201 Created
x-served-by: api-c8779bc78-8zsfk
{
  "id": 1,
  "venueId": 1,
……
  "status": "confirmed",
……
}

# 5. 再提交一条与预约 1 时间重叠的预约：被另一个副本拒绝，返回 409 和冲突时段
HTTP/1.1 409 Conflict
x-served-by: api-c8779bc78-6rkp8
{
  "defined": true,
  "code": "RESERVATION_CONFLICT",
  "status": 409,
  "message": "The requested time overlaps 1 existing reservation(s)",
  "data": {
    "conflicts": [
      {
        "id": 1,
        "startTime": "09:00",
        "endTime": "10:30"
      }
    ]
  }
}

# 6. 又创建三条预约：预约 3（场地 1，11 月 14 日 14:00–14:45）、
#    预约 4（场地 2，11 月 15 日 13:00–15:00）、预约 5（场地 3，11 月 16 日 09:30–10:00）
HTTP/1.1 201 Created
x-served-by: api-c8779bc78-927mc
……

# 7. 查询预约列表（GET /api/reservations）：返回预约 1、3、4、5，均为 confirmed
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-6rkp8
……

# 8. 取消预约 4（POST /api/reservations/4/cancel）
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-8zsfk
{
  "id": 4,
  "venueId": 2,
……
  "status": "cancelled",
……
  "cancelledAt": "2026-11-11T18:55:38.742Z"
}
```

- 五项功能（查询场地列表和详情、创建场地、创建预约并检查冲突、查询预约记录、取消预约）都返回了预期的状态码和内容。
- 冲突检测在多副本下仍然成立：预约 1 由 `api-c8779bc78-8zsfk` 写入，与它重叠的请求落在 `api-c8779bc78-6rkp8` 上并被拒绝。冲突由数据库的排他约束判定，与副本无关。
- 预约编号从 1 跳到 3：被拒绝的插入已从自增序列取走了编号 2。

### 3.2 浏览器中的业务页面

预约看板显示 7 个场地，其中 Lab 2 Demo Room 是第 3.1 节创建的，页头多了“利用率报告”入口：

![Kubernetes 上的预约看板](report-assets/lab2-03-board-zh.png)

预约记录页面显示第 3.1 节创建的 4 条预约，预约 4 为“已取消”：

![Kubernetes 上的预约记录](report-assets/lab2-04-reservations-zh.png)

### 3.3 多副本处理请求

```text
$ kubectl -n venue-booking get deploy api -o wide; kubectl -n venue-booking get endpointslices -l kubernetes.io/service-name=api
NAME   READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES                    SELECTOR
api    3/3     3            3           98s   api          venue-booking/api:2.0.0   app.kubernetes.io/name=api
NAME        ADDRESSTYPE   PORTS   ENDPOINTS                             AGE
api-qggdb   IPv4          3000    10.244.0.23,10.244.0.24,10.244.0.25   99s

$ for i in $(seq 30); do curl -s -o /dev/null -D - http://127.0.0.1:57385/api/venues | grep -i x-served-by; done | sort | uniq -c
     11 x-served-by: api-c8779bc78-6rkp8
      9 x-served-by: api-c8779bc78-8zsfk
     10 x-served-by: api-c8779bc78-927mc

$ kubectl -n venue-booking logs pod/api-c8779bc78-6rkp8 | grep 'GET /api/venues' | tail -2
GET /api/venues 200 2ms X-Served-By=api-c8779bc78-6rkp8
GET /api/venues 200 2ms X-Served-By=api-c8779bc78-6rkp8

$ kubectl -n venue-booking logs pod/api-c8779bc78-8zsfk | grep 'GET /api/venues' | tail -2
GET /api/venues 200 2ms X-Served-By=api-c8779bc78-8zsfk
GET /api/venues 200 1ms X-Served-By=api-c8779bc78-8zsfk

$ kubectl -n venue-booking logs pod/api-c8779bc78-927mc | grep 'GET /api/venues' | tail -2
GET /api/venues 200 2ms X-Served-By=api-c8779bc78-927mc
GET /api/venues 200 2ms X-Served-By=api-c8779bc78-927mc
```

三类证据相互对应：Service `api` 的 EndpointSlice 列出三个 API Pod 的 IP；连续 30 次请求的 `x-served-by` 出现三个不同的 Pod 名，次数为 11、9、10；三个 Pod 各自的日志里都有这些请求。

### 3.4 一次性报告 Job

提交一份 11 月 13 日至 16 日的报告，范围覆盖第 3.1 节创建的预约：

```text
$ curl -s -X POST http://127.0.0.1:57385/api/reports -H 'content-type: application/json' -d '{"from":"2026-11-13","to":"2026-11-16"}'
{
    "id": 2,
    "trigger": "manual",
    "from": "2026-11-13",
    "to": "2026-11-16",
    "status": "pending",
    "jobName": "venue-report-manual-2-6a6b8",
……
}

# 每秒查询一次报告状态，直到结束（列：时间 状态 startedAt finishedAt）
18:56:03 succeeded 2026-11-11T18:56:03.615Z 2026-11-11T18:56:03.636Z

$ kubectl -n venue-booking get jobs -L venue-booking/report-id
NAME                          STATUS     COMPLETIONS   DURATION   AGE   REPORT-ID
venue-report-29907056         Complete   1/1           3s         4s    
venue-report-manual-2-6a6b8   Running    0/1           1s         2s    2

$ kubectl -n venue-booking describe job venue-report-manual-2-6a6b8
Name:                        venue-report-manual-2-6a6b8
Namespace:                   venue-booking
……
Labels:                      app.kubernetes.io/name=venue-report
                             venue-booking/report-id=2
……
Backoff Limit:               0
TTL Seconds After Finished:  3600
Start Time:                  Thu, 12 Nov 2026 02:56:03 +0800
Active Deadline Seconds:     120s
……
    Command:
      node
      dist/report.js
……
    Environment:
      DATABASE_URL:  postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)
      JOB_NAME:       (v1:metadata.labels['batch.kubernetes.io/job-name'])
      REPORT_ID:     2
……
Events:
  Type    Reason            Age   From            Message
  ----    ------            ----  ----            -------
  Normal  SuccessfulCreate  1s    job-controller  Created pod: venue-report-manual-2-6a6b8-zqlqg

$ kubectl -n venue-booking logs job/venue-report-manual-2-6a6b8
Report 2: succeeded

$ curl -s http://127.0.0.1:57385/api/reports/2
{
    "id": 2,
    "trigger": "manual",
    "from": "2026-11-13",
    "to": "2026-11-16",
    "status": "succeeded",
    "jobName": "venue-report-manual-2-6a6b8",
    "createdAt": "2026-11-11T18:56:02.949Z",
    "startedAt": "2026-11-11T18:56:03.615Z",
    "finishedAt": "2026-11-11T18:56:03.636Z",
    "error": null,
    "results": [
        {
            "venueId": 1,
            "venueName": "Aurora Lecture Hall",
            "reservationCount": 2,
            "bookedMinutes": 135
        },
        {
            "venueId": 2,
            "venueName": "Seminar Room 305",
            "reservationCount": 0,
            "bookedMinutes": 0
        },
        {
            "venueId": 3,
            "venueName": "Maple Meeting Room",
            "reservationCount": 1,
            "bookedMinutes": 30
        },
……
    ]
}
```

- 唯一标识：API 返回报告编号 2 和 Job 名称 `venue-report-manual-2-6a6b8`，Job 上的标签 `venue-booking/report-id=2` 和环境变量 `REPORT_ID: 2` 指回同一份报告。编号是 2，因为 02:56:00 的第一次定时任务先写入了报告 1（列表中的 `venue-report-29907056`）。
- 状态记录：提交时为 `pending`；完成后为 `succeeded`，`startedAt` 早于 `finishedAt`，从提交到完成不到 1 秒。
- Job 的镜像、命令、`Backoff Limit: 0`、`Active Deadline Seconds: 120s` 和 TTL 都来自 CronJob 模板；输出里没有 `Controlled By` 一行，手动 Job 不属于 CronJob。
- 结果与第 3.1 节的数据一致：场地 1 有 2 条已确认预约，90 + 45 = 135 分钟；场地 3 有 1 条，30 分钟；场地 2 唯一的预约 4 已取消，所以是 0。

页面上的同一份报告。左侧列表显示每份报告的状态、触发方式、范围、执行方（Job 名称）和时间，右侧是选中的第 2 号报告，135 分钟显示为“2 小时 15 分钟”：

![利用率报告页面](report-assets/lab2-01-reports-zh.png)

### 3.5 定时报告 CronJob

```text
$ kubectl -n venue-booking get cronjob venue-report -o wide
NAME           SCHEDULE      TIMEZONE        SUSPEND   ACTIVE   LAST SCHEDULE   AGE     CONTAINERS   IMAGES                    SELECTOR
venue-report   */2 * * * *   Asia/Shanghai   False     0        15s             7m55s   report       venue-booking/api:2.0.0   <none>

$ kubectl -n venue-booking get jobs -l !venue-booking/report-id --sort-by=.metadata.creationTimestamp
NAME                    STATUS     COMPLETIONS   DURATION   AGE
venue-report-29907058   Complete   1/1           3s         4m15s
venue-report-29907060   Complete   1/1           3s         2m15s
venue-report-29907062   Complete   1/1           2s         15s

$ kubectl -n venue-booking logs job.batch/venue-report-29907060
Report 1: succeeded

$ kubectl -n venue-booking logs job.batch/venue-report-29907062
Report 1: succeeded

$ curl -s http://127.0.0.1:57385/api/reports   (id trigger status from to jobName startedAt finishedAt error)
1 scheduled succeeded 2026-11-12 2026-11-18 venue-report-29907062 2026-11-11T19:02:00.592Z 2026-11-11T19:02:00.607Z None
3 manual failed 2026-11-13 2026-11-19 venue-report-manual-3-3aec4 None 2026-11-11T18:57:22.784Z Report runner is unavailable
2 manual succeeded 2026-11-13 2026-11-16 venue-report-manual-2-6a6b8 2026-11-11T18:56:03.615Z 2026-11-11T18:56:03.636Z None
```

- CronJob 按 2 分钟的周期自动运行。Job 名称的后缀是调度时刻的分钟数：29907062 对应东八区 03:02，与报告 1 的 `startedAt`（19:02:00.592Z）吻合。
- 到 03:02 共运行 4 次（02:56、02:58、03:00、03:02），每次都是 `Complete 1/1`。列表只保留最近 3 个，最早的 `venue-report-29907056` 已按 `successfulJobsHistoryLimit: 3` 清理。
- 4 次运行写的是同一条记录：各 Job 的日志都是 `Report 1: succeeded`，API 里只有一条 `scheduled` 报告，统计范围是 11 月 12 日至 18 日，`jobName` 是最近一次的 Job。
- 报告 3 是第 3.10 节故意制造的失败记录。

### 3.6 DaemonSet：Fluent Bit 日志采集

```text
$ kubectl -n venue-booking get daemonset fluent-bit -o wide
NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE     CONTAINERS   IMAGES                    SELECTOR
fluent-bit   1         1         1       1            1           kubernetes.io/os=linux   2m45s   fluent-bit   fluent/fluent-bit:5.1.5   app.kubernetes.io/name=fluent-bit

$ kubectl -n venue-booking get pods -l app.kubernetes.io/name=fluent-bit -o wide
NAME               READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
fluent-bit-2tvks   1/1     Running   0          2m46s   10.244.0.27   minikube   <none>           <none>

$ kubectl -n venue-booking logs ds/fluent-bit | grep '"container_name":"report"' | tail -2
{"date":1794423360.722545,"time":"2026-11-11T18:56:00.722544864Z","stream":"stdout","_p":"F","log":"Report 1: succeeded","kubernetes":{"pod_name":"venue-report-29907056-7pz75","namespace_name":"venue-booking","container_name":"report","docker_id":"785c06c5ded4b0370e88c3d5b27e99f53a063256bb021c3aace62b590febb2a8"}}
{"date":1794423363.640532,"time":"2026-11-11T18:56:03.640531603Z","stream":"stdout","_p":"F","log":"Report 2: succeeded","kubernetes":{"pod_name":"venue-report-manual-2-6a6b8-zqlqg","namespace_name":"venue-booking","container_name":"report","docker_id":"5479aab23d698ca3c314f79fab3d869b19fcf968a5e51988fe56f19a6d80083f"}}
```

- 集群只有 1 个节点，DaemonSet 的 `DESIRED`、`CURRENT`、`READY` 都是 1，唯一的 Pod 运行在节点 `minikube` 上。
- 采集结果带有从文件名解析出的 `pod_name`、`namespace_name` 和 `container_name`。两个只运行了几秒的报告 Pod（定时和手动各一个）的日志也被采集到，时间与第 3.4 节一致。

### 3.7 PVC 与数据持久化

```text
$ kubectl -n venue-booking get pvc,pv -o wide
NAME                                    STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE     VOLUMEMODE
persistentvolumeclaim/data-postgres-0   Bound    pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            standard       <unset>                 2m48s   Filesystem

NAME                                                        CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                           STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE     VOLUMEMODE
persistentvolume/pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            Delete           Bound    venue-booking/data-postgres-0   standard       <unset>                          2m47s   Filesystem

# PVC 的挂载点，以及其中 PostgreSQL 18 的数据目录
$ kubectl -n venue-booking exec postgres-0 -- sh -c 'grep /var/lib/postgresql /proc/mounts; ls /var/lib/postgresql/18/docker | head -5'
/dev/sde /var/lib/postgresql ext4 rw,relatime 0 0
PG_VERSION
base
global
pg_commit_ts
pg_dynshmem

$ curl -s http://127.0.0.1:57385/api/reservations | python -c 'count'
4 reservations before
$ kubectl -n venue-booking delete pod postgres-0
pod "postgres-0" deleted from venue-booking namespace

$ kubectl -n venue-booking rollout status sts/postgres --timeout=180s
Waiting for 1 pods to be ready...
partitioned roll out complete: 1 new pods have been updated...

pod uid before: 8aa430b1-b6b9-4b45-a7eb-d71b5608cb19
pod uid after:  640d3785-a998-42b9-8611-bb48398da207

4 reservations after

$ kubectl -n venue-booking get pod postgres-0 -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP            NODE       NOMINATED NODE   READINESS GATES
postgres-0   1/1     Running   0          5s    10.244.0.30   minikube   <none>           <none>
```

- PVC `data-postgres-0` 由 StatefulSet 自动创建，绑定到动态制备的 1Gi PV；数据目录 `/var/lib/postgresql/18/docker` 在卷内。
- 删除 Pod 后，StatefulSet 创建了同名的新 Pod：UID 和 IP 都变了，重启次数为 0，说明 Pod 是重新创建的。
- 删除前后预约都是 4 条，数据没有丢失。之后的定时报告、截图和端到端测试都运行在重建后的数据库上。

### 3.8 ConfigMap 与 Secret

```text
$ kubectl -n venue-booking get configmap/app-config-5tdtccbhm6 -o jsonpath={.data}
{"APP_TIME_ZONE":"Asia/Shanghai","DB_SEED_ON_START":"true","PORT":"3000","POSTGRES_DB":"venue_booking","REPORT_CRONJOB_NAME":"venue-report","REPORT_RUNNER":"kubernetes","REPORT_WINDOW_DAYS":"7"}
$ kubectl -n venue-booking describe secret/postgres-credentials-c54md297kf   (values are not printed by describe)
Name:         postgres-credentials-c54md297kf
Namespace:    venue-booking
……
Type:  Opaque

Data
====
POSTGRES_PASSWORD:  32 bytes
POSTGRES_USER:      5 bytes

$ kubectl -n venue-booking exec deploy/api -- printenv | grep -E 'REPORT_|APP_TIME_ZONE|POSTGRES_DB|NODE_EXTRA|DATABASE_URL' (password masked)
POSTGRES_DB=venue_booking
DATABASE_URL=postgres://venue:****@postgres:5432/venue_booking
REPORT_CRONJOB_NAME=venue-report
NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
REPORT_RUNNER=kubernetes
REPORT_WINDOW_DAYS=7
APP_TIME_ZONE=Asia/Shanghai
```

- ConfigMap 中是 7 个非敏感键；Secret 中只有用户名和密码，实验使用随机生成的 32 字节密码。
- API 容器里的环境变量与 ConfigMap 一致，`DATABASE_URL` 已由 `$(VAR)` 展开为完整连接串（记录时把密码替换为 `****`）。第 3.4 节 `describe job` 显示的是展开前的模板，清单里没有明文密码。

### 3.9 Service 与集群内 DNS

```text
$ kubectl -n venue-booking get svc -o wide
NAME       TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE     SELECTOR
api        ClusterIP   10.100.232.44   <none>        3000/TCP         2m59s   app.kubernetes.io/name=api
postgres   ClusterIP   None            <none>        5432/TCP         2m59s   app.kubernetes.io/name=postgres
web        NodePort    10.106.130.55   <none>        8080:31975/TCP   2m59s   app.kubernetes.io/name=web

$ kubectl -n venue-booking get endpointslices
NAME             ADDRESSTYPE   PORTS   ENDPOINTS                             AGE
api-qggdb        IPv4          3000    10.244.0.23,10.244.0.24,10.244.0.25   2m59s
postgres-rqwvd   IPv4          5432    10.244.0.30                           2m59s
web-spz2n        IPv4          8080    10.244.0.21,10.244.0.22               2m59s

$ kubectl -n venue-booking exec deploy/web -- getent hosts api.venue-booking.svc.cluster.local postgres.venue-booking.svc.cluster.local postgres-0.postgres.venue-booking.svc.cluster.local
10.100.232.44     api.venue-booking.svc.cluster.local  api.venue-booking.svc.cluster.local
10.244.0.30       postgres.venue-booking.svc.cluster.local  postgres.venue-booking.svc.cluster.local
10.244.0.30       postgres-0.postgres.venue-booking.svc.cluster.local  postgres-0.postgres.venue-booking.svc.cluster.local

$ kubectl -n venue-booking exec deploy/web -- wget -qO- http://api.venue-booking.svc.cluster.local:3000/api/health
{"status":"ok","database":"up"}
```

- 只有 `web` 有节点端口（31975），`api` 只有集群内的 ClusterIP，`postgres` 没有 ClusterIP，数据库端口不对集群外开放。
- `api` 的域名解析到 ClusterIP，由 kube-proxy 分发到 3 个端点；Headless 的 `postgres` 和 StatefulSet 提供的 `postgres-0.postgres` 直接解析到 Pod IP。这段输出记录于数据库 Pod 重建之后，DNS 已指向新 IP `10.244.0.30`。
- 从 `web` 的 Pod 内按域名访问 API 的健康检查成功，API 也通过 `postgres` 这个名称连上了数据库。

### 3.10 RBAC 与报告失败路径

以 ServiceAccount 的身份逐项检查权限：

```text
$ kubectl -n venue-booking auth can-i get cronjobs/venue-report --as=system:serviceaccount:venue-booking:api
yes
$ kubectl -n venue-booking auth can-i get cronjobs/other --as=system:serviceaccount:venue-booking:api
no
$ kubectl -n venue-booking auth can-i create jobs --as=system:serviceaccount:venue-booking:api
yes
$ kubectl -n venue-booking auth can-i delete jobs --as=system:serviceaccount:venue-booking:api
no
$ kubectl -n venue-booking auth can-i get secrets --as=system:serviceaccount:venue-booking:api
no
$ kubectl -n venue-booking auth can-i delete pods --as=system:serviceaccount:venue-booking:api
no
$ kubectl -n venue-booking auth can-i create jobs --as=system:serviceaccount:venue-booking:default
no
```

ServiceAccount `api` 只能读取 `venue-report` 这一个 CronJob 和创建 Job；其他 Pod 使用的 `default` 账号不能创建 Job。

为了验证失败状态的记录，临时删除 RoleBinding，使 API 失去调用 Kubernetes API 的权限，请求一份报告，然后恢复：

```text
$ kubectl -n venue-booking delete rolebinding report-launcher
rolebinding.rbac.authorization.k8s.io "report-launcher" deleted from venue-booking namespace

$ curl -s -i -X POST http://127.0.0.1:57385/api/reports -H 'content-type: application/json' -d '{"from":"2026-11-13","to":"2026-11-19"}'
HTTP/1.1 503 Service Unavailable
x-served-by: api-c8779bc78-8zsfk
{"defined":true,"code":"REPORT_RUNNER_UNAVAILABLE","status":503,"message":"The report could not be started; try again later"}

$ curl -s http://127.0.0.1:57385/api/reports | head -1
3 manual failed 2026-11-13 2026-11-19 venue-report-manual-3-3aec4 None 2026-11-11T18:57:22.784Z Report runner is unavailable

$ kubectl -n venue-booking logs deploy/api --all-containers --since=1m | grep -i 'job'  (all replicas)
Error: Could not read report CronJob (HTTP 403)
……
Error: Could not read report Job (HTTP 403)
……

$ kubectl apply -k deploy/k8s
……
rolebinding.rbac.authorization.k8s.io/report-launcher created
……
```

- 没有权限时，读取 CronJob 模板得到 403；API 再确认该 Job 不存在（同样 403），把报告 3 记为 `failed`，`finishedAt` 有值而 `startedAt` 为空，并向客户端返回 503。
- 失败的报告保留编号和预先确定的 Job 名称，可以在列表里追踪。客户端看到固定文案，具体原因（HTTP 403）写在 API 日志里。
- 重新 `apply` 只补建了 RoleBinding，没有触发滚动更新，各 Pod 的重启次数仍为 0。

页面上失败的报告显示本地化提示，下面附服务端的原因：

![失败的报告](report-assets/lab2-06-report-failed-zh.png)

### 3.11 自动化测试

自动化测试在仓库的 `tests/` 目录，分三层，全部通过：

- `tests/unit`：63 个单元测试，覆盖可用时段计算、请求校验、报告窗口的时区计算、Job 清单的构造和 Kubernetes 调用的错误处理。
- `tests/integration`：81 个集成测试，在临时的 PostgreSQL 18 容器上验证场地和预约接口、预约冲突、报告的统计口径、重复执行与并发写入、Job 失败或缺失时的对账（Kubernetes API 用假的 `fetch` 替代）。
- `tests/e2e`：48 个 Playwright 端到端测试，从浏览器完成场地浏览、预约、冲突提示、取消、记录查询、中英文切换和响应式布局，以及在页面上提交报告并核对结果。端到端测试对 minikube 部署（报告由真实的 Job 完成）和 Docker Compose 部署（报告在 API 进程内完成）各运行一遍。

类型检查、Oxlint、Oxfmt 和 Knip 也全部通过。

## 4. 小组分工与问题解决

### 4.1 小组成员与分工

| 成员   | 学号        | 负责内容                                                                                                                         |
| ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 彭知书 | 23300660010 | 后端报告功能：接口契约、`reports` 表、聚合查询、报告任务入口、通过 Kubernetes API 创建和查询 Job、查询时对账、多副本的实例标识   |
| 黄泓力 | 24340240003 | 前端报告页面：日期表单与校验、报告列表与结果表、状态轮询、失败提示、中英文文案、手机布局；报告页面的端到端测试                   |
| 郑皓名 | 23340240063 | Kubernetes 清单与部署：StatefulSet 与 PVC、Service、ConfigMap 和 Secret、探针与资源配置、CronJob、Fluent Bit DaemonSet、RBAC；在 minikube 上部署并验证 |

### 4.2 问题与解决过程

- **`running` 状态看不到，开始时间等于结束时间。** 第一次部署时，报告总是从 `pending` 直接变成 `succeeded`，`startedAt` 与 `finishedAt` 相同。原因是“标记开始”和“写入结果”在同一个事务里：提交前其他连接看不到 `running`，而 `now()` 返回事务开始时间。改为两个事务，先单独提交 `running`，时间改用 `clock_timestamp()`。
- **手动报告可能永远停在 `pending`。** 如果先插入报告行、再创建 Job、最后回填 Job 名称，API 在中间崩溃或超时后，报告行既没有 Job 名称可供对账，也没有 Job 会让它结束。改为插入时就生成并保存 Job 名称，再用这个名称创建 Job，并加入查询时对账（第 2.9 节）。
- **工作进程失败后 Job 还会重试。** 最初 `backoffLimit` 是 1：工作进程已把报告写成 `failed`，Kubernetes 却还会再启动一个 Pod，两边状态对不上。模板因此定为 `backoffLimit: 0`。
- **nginx 解析不到短名称 `api`。** Lab 1 的上游是 `http://api:3000`，在 Kubernetes 里短名称依赖搜索域，而 nginx 的 `resolver` 不使用搜索域。在 `web` 的清单里把 `API_UPSTREAM` 设为完整域名，镜像和 nginx 模板不用改。
- **Fluent Bit 拿不到 Pod 元数据，并会漏掉短命 Pod 的日志。** `use_tag_for_meta` 从标签解析元数据，而 `tail` 默认的标签不含文件路径；另外它默认每 60 秒才发现新文件，并从末尾读起。解决办法是加上 `tag: kube.*` 和对应的 `kube_tag_prefix`，并设置 `refresh_interval: 5` 和 `read_from_head: true`，第 3.6 节可以看到两个报告 Pod 的输出。
- **数据库探针在初始化期间就会通过。** PostgreSQL 镜像第一次启动时先起一个只监听 Unix 套接字的临时实例做初始化，不带 `-h` 的 `pg_isready` 会提前通过，Pod 会在真正的实例监听 5432 之前被加入端点。探针因此改为 `pg_isready -h 127.0.0.1`。

## 5. 提交时间

本报告于 2026 年 11 月 18 日完成，提交截止时间为 2026 年 11 月 23 日，提交至 elearning。
