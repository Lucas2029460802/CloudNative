# 实验二报告：场地预约系统 Kubernetes 工作负载编排

《CS30074 云原生软件技术》课程实验二

| 项目     | 内容                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- |
| 小组     | 彭知书、黄泓力、郑皓名                                                                      |
| 成员     | 彭知书（后端 API 与报告任务）、黄泓力（前端）、郑皓名（Kubernetes 部署与数据库），见第 4 节 |
| 代码仓库 | <https://github.com/Lucas2029460802/CloudNative>                                            |
| 报告日期 | 2026 年 11 月 12 日                                                                         |

> 说明：报告中的命令输出和截图都来自 2026 年 11 月 12 日 02:50 至 03:05（东八区）在本机 minikube 集群上对本系统的实际运行，原始输出保存在 `docs/report-assets/lab2/` 的 `01-environment.txt` 至 `14-e2e-k8s.txt`。输出只删去了重复或与验证无关的行，删减处用“……”表示；代码块中以 `#` 开头的中文行是报告添加的注释，不属于命令输出。命令使用 Git Bash 语法，`$` 表示提示符。API 返回的时间戳为 UTC（以 `Z` 结尾），加 8 小时即东八区时间。少数标明“撰写报告时复查”的内容，是 03:05 之后用只读的 `kubectl get`、`describe`、`logs` 在同一集群上补查的。

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
| 部署工具        | 纯 YAML + Kustomize（`kubectl apply -k deploy/k8s`），没有使用 Helm              |

```text
$ minikube version
minikube version: v1.39.0
commit: 7a9f6a841470a207de8cf4bafcccee0969d8ba10

$ kubectl version
Client Version: v1.37.1
Kustomize Version: v5.8.1
Server Version: v1.37.0

$ minikube profile list
┌──────────┬────────┬────────────┬──────────────┬─────────┬────────┬───────┬────────────────┬────────────────────┐
│ PROFILE  │ DRIVER │  RUNTIME   │      IP      │ VERSION │ STATUS │ NODES │ ACTIVE PROFILE │ ACTIVE KUBECONTEXT │
├──────────┼────────┼────────────┼──────────────┼─────────┼────────┼───────┼────────────────┼────────────────────┤
│ minikube │ docker │ containerd │ 192.168.49.2 │ v1.37.0 │ OK     │ 1     │ *              │ *                  │
└──────────┴────────┴────────────┴──────────────┴─────────┴────────┴───────┴────────────────┴────────────────────┘
```

### 1.2 节点信息

```text
$ kubectl get nodes -o wide
NAME       STATUS   ROLES           AGE   VERSION   INTERNAL-IP    EXTERNAL-IP   OS-IMAGE                         KERNEL-VERSION                              CONTAINER-RUNTIME
minikube   Ready    control-plane   66m   v1.37.0   192.168.49.2   <none>        Debian GNU/Linux 12 (bookworm)   6.18.58.1-microsoft-standard-WSL2 (amd64)   containerd://2.3.4

$ kubectl describe node minikube (excerpt)
Capacity:
  cpu:                24
  ephemeral-storage:  1081101176832
……
  memory:             28736468Ki
  pods:               110
……
System Info:
……
  Kernel Version:             6.18.58.1-microsoft-standard-WSL2
  OS Image:                   Debian GNU/Linux 12 (bookworm)
  Operating System:           linux
  Architecture:               amd64
  Container Runtime Version:  containerd://2.3.4
  Kubelet Version:            v1.37.0
PodCIDR:                      10.244.0.0/24
PodCIDRs:                     10.244.0.0/24
```

集群只有一个节点 `minikube`，角色为 `control-plane`，状态 `Ready`。节点是 Docker Desktop 里的一个容器，内核来自 WSL 2，可分配 24 个 CPU、约 27.4 GiB 内存、最多 110 个 Pod，Pod 网段为 `10.244.0.0/24`。

```text
$ kubectl get storageclass
NAME                 PROVISIONER                RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
standard (default)   k8s.io/minikube-hostpath   Delete          Immediate           false                  66m
```

### 1.3 镜像使用方式

本实验没有使用镜像仓库。两个应用镜像沿用 Lab 1 的 Dockerfile 和 Compose 构建配置，构建后直接装入节点：

1. `IMAGE_TAG=2.0.0 docker compose build api frontend` 在主机的 Docker 中构建 `venue-booking/api:2.0.0` 和 `venue-booking/frontend:2.0.0`（Lab 1 的标签是 `1.0.0`）。
2. 节点使用 containerd，看不到主机 Docker 里的镜像，所以用 `minikube image load` 把这两个镜像复制进节点。
3. 清单中两个镜像都写 `imagePullPolicy: IfNotPresent`，kubelet 直接使用节点上已有的镜像，不会去 Docker Hub 拉取这两个并不存在于仓库的镜像。
4. 镜像标签只在 `deploy/k8s/kustomization.yaml` 的 `images[].newTag` 里写一次。每次重新构建都要换一个新标签，并同时修改 `IMAGE_TAG` 和 `newTag`：标签不变时 Pod 模板不变，Deployment 不会滚动更新。
5. 第三方镜像 `postgres:18.6-alpine3.24` 和 `fluent/fluent-bit:5.1.5` 固定到确切标签，由节点自行拉取。

API 镜像里有两个入口：`dist/server.js`（HTTP 服务，镜像默认命令）和 `dist/report.js`（报告任务）。`apps/api/package.json` 的构建命令为 `bun build src/server.ts src/report.ts --target=node --outdir=dist`，Dockerfile 没有新增构建阶段，报告任务与 API 复用同一个镜像。

```text
$ minikube image ls
……
docker.io/venue-booking/frontend:2.0.0
docker.io/venue-booking/api:2.0.0
docker.io/library/postgres:18.6-alpine3.24
docker.io/fluent/fluent-bit:5.1.5
# 只保留本系统用到的四个镜像
```

### 1.4 集群外访问方式

只有前端的 Service `web` 是 NodePort 类型。在 Windows 上使用 docker 驱动时，节点 IP `192.168.49.2` 位于 Docker Desktop 的内部网络，主机无法直接路由到它，因此不能用“节点 IP:NodePort”访问，而是运行：

```bash
minikube service web -n venue-booking --url
```

该命令在主机上建立一条到 NodePort 的隧道并打印本地地址，本次为 `http://127.0.0.1:57385`（端口每次随机），命令所在的终端需要保持打开。第 3 节的 `curl` 和端到端测试都通过这个地址访问系统。

### 1.5 复现步骤

以下步骤来自 `deploy/k8s/README.md`，在仓库根目录用 Git Bash 执行；前提是已安装 Docker、minikube 和 kubectl，并按 Lab 1 的方式准备好根目录的 `.env`（`cp .env.example .env`，Compose 构建时需要）。

```bash
minikube start

# 1. 构建两个镜像并装入集群（不使用镜像仓库）
IMAGE_TAG=2.0.0 docker compose build api frontend
minikube image load venue-booking/api:2.0.0 venue-booking/frontend:2.0.0

# 2. 准备数据库凭据（该文件被 Git 忽略），并修改其中的密码
cp deploy/k8s/secret.env.example deploy/k8s/secret.env

# 3. 部署全部资源并等待就绪
kubectl apply -k deploy/k8s
kubectl -n venue-booking rollout status deploy/api deploy/web sts/postgres

# 4. 打开访问入口（保持该终端打开）
minikube service web -n venue-booking --url

# 清理：删除命名空间，PVC 和其中的数据也一并删除
kubectl delete -k deploy/k8s
```

### 1.6 命名空间资源列表

部署 43 秒后的资源状态如下，全部 Pod 一次就绪，重启次数为 0：

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

NAME                                            ADDRESSTYPE   PORTS   ENDPOINTS                             AGE
endpointslice.discovery.k8s.io/api-qggdb        IPv4          3000    10.244.0.23,10.244.0.24,10.244.0.25   43s
endpointslice.discovery.k8s.io/postgres-rqwvd   IPv4          5432    10.244.0.26                           43s
endpointslice.discovery.k8s.io/web-spz2n        IPv4          8080    10.244.0.21,10.244.0.22               43s

NAME                                     DATA   AGE
configmap/app-config-5tdtccbhm6          7      43s
configmap/fluent-bit-config-42d4ht6hdc   1      43s
configmap/kube-root-ca.crt               1      43s

NAME                                     TYPE     DATA   AGE
secret/postgres-credentials-c54md297kf   Opaque   2      43s

NAME                                    STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE   VOLUMEMODE
persistentvolumeclaim/data-postgres-0   Bound    pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            standard       <unset>                 43s   Filesystem

NAME                     AGE
serviceaccount/api       43s
serviceaccount/default   43s

NAME                                             CREATED AT
role.rbac.authorization.k8s.io/report-launcher   2026-11-11T18:54:19Z

NAME                                                    ROLE                   AGE   USERS   GROUPS   SERVICEACCOUNTS
rolebinding.rbac.authorization.k8s.io/report-launcher   Role/report-launcher   43s                    venue-booking/api
```

此时 CronJob 还没有到第一个调度时刻，所以列表里没有 Job。`kube-root-ca.crt` 和 ServiceAccount `default` 由 Kubernetes 自动创建，其余资源都来自 `deploy/k8s/`。

## 2. Lab2 系统架构与组件

### 2.1 系统架构图

![Lab 2 系统架构图](report-assets/lab2-00-architecture.png)

图 1 Lab 2 系统架构。实线是请求或数据流向，虚线是配置注入；Mermaid 源文件为 `docs/report-assets/lab2/architecture.mmd`，用同目录的 `render-diagram.mjs` 生成图片。

图中三条链路：

- 用户请求：浏览器经 `minikube service` 隧道进入 NodePort Service `web`，nginx 把 `/api/*` 转发到 ClusterIP Service `api`，API 再通过 Headless Service `postgres` 访问 `postgres-0`。只有 `web` 对集群外开放。
- 报告任务：手动报告由 API 调用 kube-apiserver 创建 Job；定时报告由 CronJob `venue-report` 按时创建 Job。两种 Job 运行同一个 `node dist/report.js`，结果写回 PostgreSQL。
- 日志采集：DaemonSet `fluent-bit` 在每个节点上以只读 hostPath 读取容器日志，补充 Pod 元数据后输出到自身 stdout。

与 Lab 1 的对应关系：

| Lab 1（Docker Compose）                          | Lab 2（Kubernetes）                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 服务 `frontend`，发布主机端口 8080               | Deployment `web`（2 副本）+ NodePort Service `web`                           |
| 服务 `api`，不发布端口                           | Deployment `api`（3 副本）+ ClusterIP Service `api`                          |
| 服务 `database` + 命名卷 `database-data`         | StatefulSet `postgres` + Headless Service `postgres` + PVC `data-postgres-0` |
| `.env` 注入环境变量                              | ConfigMap `app-config` + Secret `postgres-credentials`                       |
| `frontend-net`、`backend-net` 两个网络隔离数据库 | 只有 `web` 对集群外开放，`api` 和 `postgres` 只有集群内地址                  |
| 无                                               | CronJob 和 Job（利用率报告）、DaemonSet（日志采集）、ServiceAccount 与 RBAC  |

Lab 1 的五项业务功能和 Compose 部署方式都保留。Compose 环境没有 Kubernetes API，报告在 API 进程内直接计算（`REPORT_RUNNER` 未设置时为 `inline`），所以同一套代码在两种环境下都能跑通全部端到端测试（第 3.12 节）。

### 2.2 Kubernetes 资源列表

| 资源类型 | 本组资源名称 | 承载的组件或任务 | 说明 |
| -------- | ------------ | ---------------- | ---- |
| Deployment | `api`（3 副本） | 后端 REST API（Node.js，端口 3000） | 无状态，数据全部在 PostgreSQL 中，可以水平扩展。使用 ServiceAccount `api` 调用 Kubernetes API 创建报告 Job。滚动更新 `maxUnavailable: 0`、`maxSurge: 1` |
| Deployment | `web`（2 副本） | 前端 nginx（端口 8080）：静态资源和 `/api` 反向代理 | 无状态。2 个副本保证滚动更新或单个 Pod 故障时入口不中断 |
| StatefulSet | `postgres`（1 副本，Pod `postgres-0`） | PostgreSQL 18.6 数据库 | 需要稳定的 Pod 名称和与之绑定的存储。`volumeClaimTemplates` 为它创建 PVC。单写入者，不做多副本 |
| Job | `venue-report-manual-<报告编号>-<5 位随机串>`，如 `venue-report-manual-2-6a6b8` | 用户在页面或 API 上手动触发的一次性利用率报告 | 由 API 复制 CronJob 的 `jobTemplate` 创建，运行一次后结束。Job 名称保存在报告记录的 `jobName` 字段中 |
| Job | `venue-report-<调度时间>`，如 `venue-report-29907062` | CronJob 每次调度产生的报告任务 | 由 CronJob 控制器创建，后缀是调度时刻（自 Unix 纪元起的分钟数） |
| CronJob | `venue-report` | 定时生成从当天起 7 天的利用率报告 | 演示周期 `*/2 * * * *`，`timeZone: Asia/Shanghai`，`concurrencyPolicy: Forbid`。它的 `jobTemplate` 同时是手动 Job 的模板 |
| DaemonSet | `fluent-bit` | 节点级日志采集（Fluent Bit 5.1.5） | 每个节点运行一个 Pod，读取该节点上本命名空间所有容器的日志文件 |
| Service | `web`（NodePort，8080:31975） | 前端入口 | 唯一对集群外开放的 Service |
| Service | `api`（ClusterIP，3000） | 后端 API | 只供集群内的 `web` 访问，并在 3 个 API Pod 之间分发连接 |
| Service | `postgres`（Headless，5432） | 数据库 | StatefulSet 的 `serviceName`，为 `postgres-0` 提供稳定 DNS 名称；不分配 ClusterIP，不对集群外开放 |
| ConfigMap | `app-config-<hash>`（本次为 `app-config-5tdtccbhm6`） | API、报告任务和数据库的非敏感配置 | 由 `config.env` 生成，共 7 个键 |
| ConfigMap | `fluent-bit-config-<hash>`（本次为 `fluent-bit-config-42d4ht6hdc`） | Fluent Bit 的采集管道配置 | 由 `fluent-bit-pipeline.yaml` 生成，以文件形式挂载 |
| Secret | `postgres-credentials-<hash>`（本次为 `postgres-credentials-c54md297kf`） | 数据库用户名和密码 | 由被 Git 忽略的 `secret.env` 生成，仓库里只有 `secret.env.example` |
| PVC | `data-postgres-0`（1Gi，RWO，StorageClass `standard`） | PostgreSQL 数据目录 | 由 StatefulSet 的 `volumeClaimTemplates` 创建，Pod 重建后重新挂载同一个卷 |

表格之外还有四个辅助资源：Namespace `venue-booking`，ServiceAccount `api`，Role `report-launcher` 和同名 RoleBinding（第 2.10 节）。清单文件与资源的对应关系：

| 文件（`deploy/k8s/`）                         | 内容                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `kustomization.yaml`                          | 命名空间、资源列表、镜像标签、ConfigMap 和 Secret 生成器、公共标签 `app.kubernetes.io/part-of` |
| `namespace.yaml`                              | Namespace                                                                                      |
| `postgres.yaml`                               | Headless Service、StatefulSet（含 `volumeClaimTemplates`）                                     |
| `api.yaml`                                    | ServiceAccount、Role、RoleBinding、Service、Deployment                                         |
| `web.yaml`                                    | Service、Deployment                                                                            |
| `report-cronjob.yaml`                         | CronJob                                                                                        |
| `fluent-bit.yaml`、`fluent-bit-pipeline.yaml` | DaemonSet 及其采集配置                                                                         |
| `config.env`、`secret.env.example`            | ConfigMap 的内容、Secret 的模板                                                                |

### 2.3 工作负载类型的选择

按“是否持续运行、是否有状态、运行几次、在哪里运行”四个问题给每个组件选择工作负载：

| 组件或任务 | 运行特征 | 工作负载 | 理由 |
| ---------- | -------- | -------- | ---- |
| `api` | 持续运行，无状态 | Deployment | 各副本完全等价，可以任意替换、增减和滚动更新，不需要固定名称，也不需要自己的存储 |
| `web` | 持续运行，无状态 | Deployment | nginx 只提供镜像内的静态文件并转发 `/api`，同样可以任意替换 |
| `postgres` | 持续运行，有状态 | StatefulSet | 数据必须跟随实例：Pod 重建后要用同一个名称挂回同一个卷。Deployment 的 Pod 名称随机，多个副本还会争用同一个 PVC |
| 手动报告 | 运行一次就结束 | Job | 任务有明确的终点和成功或失败结果。Job 记录完成状态，并由 `activeDeadlineSeconds` 和 `ttlSecondsAfterFinished` 限定运行时长和保留时间 |
| 定时报告 | 按周期重复运行 | CronJob | 由集群按 cron 表达式创建 Job，不需要在 API 进程里维护定时器。API 有 3 个副本，进程内定时器会重复触发 3 次 |
| 日志采集 | 每个节点都要有一份 | DaemonSet | 容器日志文件在各节点本地的 `/var/log` 下，只有运行在该节点上的 Pod 才能通过 hostPath 读到。节点增减时由 DaemonSet 控制器自动补齐或回收 |

数据库迁移没有单独做成 Job：沿用 Lab 1 的做法，API 启动时在 PostgreSQL 咨询锁保护下执行迁移（`apps/api/src/db/prepare.ts`），3 个副本同时启动也只有一个在执行，其余等待。报告任务不执行迁移。

没有配置 HPA、PodDisruptionBudget 和拓扑分布约束：单节点集群上它们不改变任何行为，属于多节点环境的后续工作。

### 2.4 Service 的设置

| 组件 | 是否需要 Service | 类型 | 理由 |
| ---- | ---------------- | ---- | ---- |
| `web` | 需要 | NodePort | 用户从集群外访问的入口。没有使用 Ingress：`web` 里的 nginx 已经承担了 `/api` 路由，再加一层 Ingress 控制器没有收益，而且 minikube 的 ingress 插件基于已停止维护的 ingress-nginx（第 4.3 节） |
| `api` | 需要 | ClusterIP | `web` 需要一个不随 Pod 变化的地址，并把请求分给 3 个副本。浏览器只访问 `web` 的同源 `/api`，所以 API 不需要对集群外开放 |
| `postgres` | 需要 | Headless（`clusterIP: None`） | API 和报告任务通过名称 `postgres` 连接。只有一个实例，不需要负载均衡；Headless Service 同时是 StatefulSet 要求的 `serviceName`，提供 `postgres-0.postgres` 这一固定名称。数据库端口不对集群外开放 |
| 报告 Job、CronJob | 不需要 | 无 | 只主动连接数据库，没有任何组件访问它们 |
| `fluent-bit` | 不需要 | 无 | 只读取本节点的日志文件并输出，没有入站流量 |

组件之间一律使用 Service 的 DNS 名称，不依赖 Pod IP：

- nginx 的上游是 `http://api.venue-booking.svc.cluster.local:3000`。这里必须写完整域名：nginx 的 `resolver` 指令不使用 `/etc/resolv.conf` 里的搜索域，短名称 `api` 解析不到。模板中用变量形式的 `proxy_pass`，每个请求重新解析（缓存 10 秒），与 Lab 1 相同。
- API 和报告任务的连接串是 `postgres://…@postgres:5432/venue_booking`，主机名是同命名空间的 Service 名。

第 3.7 节中 `postgres-0` 被删除重建，Pod IP 从 `10.244.0.26` 变为 `10.244.0.30`，名称 `postgres` 解析到新地址，API 不需要任何改动或重启。

### 2.5 稳定网络身份、持久化存储、一次性执行、周期执行与每节点执行

#### 稳定网络身份与持久化存储：PostgreSQL

数据库是系统里唯一的有状态组件，场地、预约和报告结果都在它的数据目录里。StatefulSet 给它固定的序号名称 `postgres-0`，并通过 `volumeClaimTemplates` 生成与该名称绑定的 PVC `data-postgres-0`：Pod 无论因为什么原因重建，新 Pod 仍叫 `postgres-0`，仍挂载同一个卷。副本数为 1，因为 PostgreSQL 是单写入者，简单地增加 StatefulSet 副本只会得到几个互不相干的空数据库，要多副本必须另外配置流复制，超出本实验范围。

#### 一次性执行：手动报告 Job

一份报告是一次有终点的计算：读预约数据、聚合、写结果，然后退出。放在 Job 里，计算与 API 的请求处理隔离（各有自己的资源请求和内存上限），失败有明确的记录（Job 的 `Failed` 条件和报告行的 `failed` 状态），完成后的 Pod 和日志保留 1 小时可供查看。

#### 周期执行：CronJob

定时报告与手动报告运行同一个程序，只是不带 `REPORT_ID`。CronJob 负责按时创建 Job，并提供“上一次没跑完就不启动下一次”（`Forbid`）、错过时刻的处理（`startingDeadlineSeconds`）和历史清理（两个 `HistoryLimit`）。

#### 每节点执行：Fluent Bit DaemonSet

容器运行时把每个容器的标准输出写到所在节点的 `/var/log/pods/` 下，并在 `/var/log/containers/` 建立符号链接。要采集它们，采集器必须在每个节点上各有一个实例并挂载该节点的 `/var/log`。DaemonSet 保证“每个符合条件的节点恰好一个 Pod”：清单用 `nodeSelector: kubernetes.io/os=linux` 限定 Linux 节点，并容忍 `node-role.kubernetes.io/control-plane:NoSchedule` 污点，使它在带该污点的控制面节点上也能运行（本集群的单节点没有这个污点，容忍是为多节点集群准备的）。

### 2.6 ConfigMap 和 Secret 的内容边界与引用方式

边界：泄露后能直接访问数据的值放进 Secret，其余放进 ConfigMap。

| 资源 | 键 | 使用者 |
| ---- | --- | ------ |
| ConfigMap `app-config` | `PORT`、`APP_TIME_ZONE`、`DB_SEED_ON_START`、`POSTGRES_DB`、`REPORT_RUNNER`、`REPORT_CRONJOB_NAME`、`REPORT_WINDOW_DAYS` | `api` 和报告任务通过 `envFrom` 全部读入；`postgres` 用 `configMapKeyRef` 只取 `POSTGRES_DB` |
| ConfigMap `fluent-bit-config` | 文件 `fluent-bit.yaml` | `fluent-bit` 以卷的形式挂载到 `/fluent-bit/config` |
| Secret `postgres-credentials` | `POSTGRES_USER`、`POSTGRES_PASSWORD` | `postgres`、`api` 和报告任务通过 `envFrom` 读入 |

`deploy/k8s/config.env`：

```text
PORT=3000
APP_TIME_ZONE=Asia/Shanghai
DB_SEED_ON_START=true
POSTGRES_DB=venue_booking
REPORT_RUNNER=kubernetes
REPORT_CRONJOB_NAME=venue-report
REPORT_WINDOW_DAYS=7
```

引用方式（`deploy/k8s/api.yaml`，报告任务的写法相同）：

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

- 应用只认 `DATABASE_URL` 一个变量（与 Lab 1 相同）。清单用 Kubernetes 的 `$(VAR)` 语法，在容器启动时由用户名、密码和库名拼出连接串，密码不出现在任何清单或 ConfigMap 里，应用代码也不需要为 Kubernetes 改动。
- Secret 由 Kustomize 的 `secretGenerator` 从 `deploy/k8s/secret.env` 生成。该文件被 `.gitignore` 忽略，也被 `.dockerignore` 排除在镜像构建上下文之外；仓库只提交 `secret.env.example`，其中的密码是占位值。本次实验使用另行生成的 32 字节密码（第 3.8 节的 `describe` 输出只显示长度）。
- 两个生成器都会在资源名后加内容哈希（如 `app-config-5tdtccbhm6`），并自动改写工作负载中的引用。修改 `config.env` 或 `secret.env` 后重新 `apply`，资源名随之变化，引用它的 Pod 模板也变化，于是触发滚动更新，不会出现“配置改了但进程还在用旧值”的情况。
- 两点限制写在 `deploy/k8s/README.md` 中：`postgres` 也引用 `app-config`，所以修改 `config.env` 会连带重启数据库 Pod；PostgreSQL 只在初始化空数据目录时读取 `POSTGRES_PASSWORD`，之后改密码需要执行 `ALTER ROLE`。
- Secret 在 etcd 中默认只做 base64 编码。生产环境还应开启静态加密或接入外部密钥管理，本实验没有涉及。

### 2.7 PVC 与存储方案

需要持久化的只有 PostgreSQL 的数据目录。`web` 和 `api` 的 Pod 不保存任何数据，报告结果也写在数据库的 `reports` 表里，报告 Job 的 Pod 不需要卷。

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

- StorageClass `standard` 是 minikube 的默认存储类，制备器 `k8s.io/minikube-hostpath` 在节点文件系统上动态创建 PV。PVC 创建后立即绑定（`VolumeBindingMode: Immediate`），不需要手工准备 PV。
- 访问模式 `ReadWriteOnce` 与“单实例数据库”一致，容量 1Gi 对演示数据足够。
- 挂载点是 `/var/lib/postgresql` 而不是旧版本常用的 `/var/lib/postgresql/data`：PostgreSQL 18 的官方镜像把数据放在 `/var/lib/postgresql/18/docker`，挂到旧路径会让数据落在容器的可写层，重建后丢失（Lab 1 报告第 11 节遇到过同一问题）。
- Pod 安全上下文中的 `fsGroup: 70` 让卷对镜像内的 `postgres` 用户（uid 70）可写，容器不需要以 root 启动。
- PVC 的生命周期独立于 Pod：删除 `postgres-0` 后，StatefulSet 重建的同名 Pod 挂回 `data-postgres-0`，数据仍在（第 3.7 节）。删除 StatefulSet 本身也不会删除 PVC；`kubectl delete -k deploy/k8s` 会删除整个命名空间，PVC 随之删除，而该 StorageClass 的回收策略是 `Delete`，数据也就一并清除。
- 局限：hostpath 卷的数据在这一个节点的磁盘上，节点损坏则数据丢失。生产环境应换用有冗余的存储类并做备份。

### 2.8 副本数设计

| 组件 | 副本数 | 依据 |
| ---- | ------ | ---- |
| `api` | 3 | 无状态：进程内不保存会话或缓存，预约冲突由数据库的排他约束和行锁判定（Lab 1 报告第 3.5 节），与请求落在哪个副本无关。启动时的迁移有咨询锁保护。3 个副本在滚动更新（先加 1 个新 Pod，就绪后再减旧 Pod）和单个 Pod 故障时仍有多个实例服务，也让“请求被多个副本处理”的证据足够明确 |
| `web` | 2 | 无状态，只提供静态文件和转发，单个请求的开销远小于 API，2 个副本已能保证更新和故障期间入口不中断 |
| `postgres` | 1 | 有状态且单写入者。副本数不是可以随意调的旋钮：多副本需要主从复制和故障切换，PVC 又是 `ReadWriteOnce` |
| 报告 Job | 每次 1 个 Pod | 任务是一次聚合查询，不需要并行；重复执行反而要靠第 2.10 节的行锁去重 |
| `fluent-bit` | 每节点 1 个 | 由节点数决定，不由负载决定 |

API 的水平扩展还有两处配套设计：

- 没有在 API 副本里放后台循环。未结束的报告在被查询时才去核对 Job 状态（第 2.10 节的“查询时对账”），所以副本之间不需要选主，也不会重复做同一件事。
- 存活探针用 `tcpSocket`，就绪探针和启动探针用 `/api/health`（内部执行 `select 1`）。数据库短暂不可用时，API Pod 只是被摘出 Service，不会被 kubelet 成批重启。第 3.7 节删除数据库 Pod 之后，撰写报告时复查三个 API Pod 的重启次数仍为 0。

请求如何分到多个副本：nginx 转发 `/api` 时对上游使用短连接，每个请求新建一条到 Service `api` 的 TCP 连接，kube-proxy 按连接在 3 个端点之间选择。为了能从外部看出是哪个副本处理了请求，API 在每个 `/api/*` 响应上加 `X-Served-By: <主机名>` 头（Pod 的主机名就是 Pod 名），请求日志里也带同一字段（`apps/api/src/app.ts`）。证据见第 3.3 节：30 个请求在三个 Pod 上的分布为 11、9、10。

资源配置：所有容器都设置了 CPU 和内存请求以及内存上限，没有设置 CPU 上限。

| 容器            | 请求（CPU / 内存） | 内存上限 |
| --------------- | ------------------ | -------- |
| `api`、`report` | 50m / 96Mi         | 256Mi    |
| `web`           | 10m / 32Mi         | 64Mi     |
| `postgres`      | 100m / 256Mi       | 512Mi    |
| `fluent-bit`    | 20m / 32Mi         | 64Mi     |

### 2.9 利用率报告的数据模型与接口

报告统计指定日期范围内各场地的预约次数和累计预约时长。口径：

- 只统计状态为 `confirmed` 的预约，已取消的不计入；
- 日期范围首尾都包含，按预约日期 `reservation_date` 判断。一条预约只属于一个日期，且开始时间早于结束时间，不会跨天，所以不需要按范围裁剪时长；
- 结果包含所有场地，没有预约的场地记为 0，停用的场地也在内；
- 一份报告最多覆盖 366 天，由接口契约和数据库检查约束同时限制。

聚合是一条 SQL（`apps/api/src/reports/run.ts` 的 `aggregateReport`，下面是等价写法）：

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

新增 `reports` 表（迁移 `apps/api/drizzle/0002_venue_utilisation_reports.sql`，只新增类型和表，不改动已有表）：

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
| `results`                   | 结果快照                     | `jsonb`          | 可空，成功后写入                                                   |

另有部分唯一索引 `reports_scheduled_period_idx (from_date, to_date) WHERE trigger = 'scheduled'`：同一个统计区间只能有一条定时报告。`results` 是 `[{venueId, venueName, reservationCount, bookedMinutes}]` 形式的 JSON：一份报告是某一时刻的快照，整体读写，与状态在同一条 `UPDATE` 里原子写入，不需要拆成子表。

报告的唯一标识有两个并相互关联：数据库里的报告编号 `id`，和 Kubernetes 里的 Job 名称。手动 Job 的名称里带有报告编号，Job 上还有标签 `venue-booking/report-id=<编号>`；报告行的 `job_name` 记录 Job 名称。

接口（定义在 `packages/contracts`，前后端共用）：

| 方法与路径 | 作用 | 成功响应 | 错误 |
| ---------- | ---- | -------- | ---- |
| `POST /api/reports` | 请求生成报告，请求体 `{from, to}` | 202 和报告对象（Kubernetes 上状态为 `pending`） | 400 `BAD_REQUEST`（日期不合法、范围颠倒或超过 366 天），503 `REPORT_RUNNER_UNAVAILABLE` |
| `GET /api/reports` | 最近 50 份报告，新的在前 | 200 和数组 | 无 |
| `GET /api/reports/{id}` | 查询一份报告及其结果 | 200 和报告对象 | 404 `REPORT_NOT_FOUND` |

前端新增“利用率报告”页面（`/reports`，`apps/web/src/features/reports/`）：选择起止日期并提交，下方列出最近的报告及其状态、触发方式、统计范围、执行方（Job 名称）和时间，选中一份后显示各场地的预约数和已预约时长。只要列表中有未结束的报告，页面就每 2 秒刷新一次。中英文文案都已补齐。

### 2.10 一次性 Job 的生命周期

```text
POST /api/reports
  │  事务：插入 reports 行（pending），并写入预先确定的 job_name
  ▼
pending
  │  API：GET cronjobs/venue-report，复制 jobTemplate，POST jobs（metadata.name = job_name）
  │  Job 的 Pod 启动 node dist/report.js
  │  事务 1：锁定报告行，核对 job_name 和状态，写 running 与 started_at，提交
  ▼
running
  │  事务 2：再次锁定并核对，执行聚合，写 results、succeeded 与 finished_at
  ▼
succeeded

任一步失败：报告行写为 failed 并记录 error；工作进程以退出码 1 结束，Job 记为 Failed
```

#### 触发与 Job 的创建

`POST /api/reports` 的处理（`apps/api/src/routers/reports.ts`）：

1. 在一个事务里插入报告行，并生成 Job 名称 `venue-report-manual-<报告编号>-<5 位随机十六进制>` 写入 `job_name`。名称在调用 Kubernetes 之前就已落库，之后无论创建请求成功、超时还是 API 进程崩溃，都能凭这个名称查到 Job 是否存在。随机后缀避免清空数据库后编号重新从 1 开始时与残留的 Job 重名。
2. 读取 CronJob `venue-report`，复制其 `spec.jobTemplate.spec`，向名为 `report` 的容器追加环境变量 `REPORT_ID`，加上标签 `venue-booking/report-id`，以预先确定的名称创建 Job（`apps/api/src/reports/launcher.ts` 的 `buildReportJob`）。镜像、环境变量、资源限制、安全上下文、`backoffLimit` 等只在 CronJob 清单里定义一次，手动和定时两种 Job 不会出现配置漂移。
3. 创建返回 409（同名 Job 已存在）视为已创建。其他错误或超时时再查一次该 Job：存在则保持 `pending` 正常返回，不存在才把报告行标为 `failed` 并返回 503。
4. 返回 202 和状态为 `pending` 的报告对象，客户端轮询 `GET /api/reports/{id}`。

手动 Job 不设置 `ownerReferences`。`kubectl create job --from=cronjob/…` 会把 CronJob 设为属主，那样手动 Job 会被计入 `concurrencyPolicy: Forbid` 的判断和历史保留上限，挤掉或阻塞定时任务。第 3.4 节 `describe job` 的输出中没有 `Controlled By` 一行。

API 没有引入 Kubernetes 客户端库，三个 REST 调用直接用 Node.js 的 `fetch` 发出：每次调用都重新读取挂载的 ServiceAccount 令牌（令牌会轮换），命名空间取自挂载的 `namespace` 文件，集群 CA 通过 `NODE_EXTRA_CA_CERTS` 加入信任，TLS 校验保持开启，请求超时 5 秒。

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

权限只有三项，分别对应上面的三个调用：读取名为 `venue-report` 的 CronJob、创建 Job、读取 Job。没有 `list`、`watch`、`delete`，也不能读 Secret 或操作 Pod。Role 是命名空间级的，通过 RoleBinding 只授予 ServiceAccount `api`。报告任务本身不访问 Kubernetes API：它的 Job 名称由 Downward API 从 Pod 标签 `batch.kubernetes.io/job-name` 注入环境变量 `JOB_NAME`，所以除 API 之外的所有 Pod 都设置了 `automountServiceAccountToken: false`。

#### 工作进程

`apps/api/src/report.ts` 是报告任务的入口：等待数据库可连接，带 `REPORT_ID` 时执行该编号的手动报告，否则执行定时报告，最后打印 `Report <编号>: <状态>`，状态不是 `succeeded` 时退出码为 1。执行逻辑在 `runReport`（`apps/api/src/reports/run.ts`）：

- 事务 1 用 `SELECT … FOR UPDATE` 锁定报告行，只有当行的 `job_name` 与本进程的 `JOB_NAME` 一致且状态为 `pending` 时才写入 `running` 和 `started_at` 并提交。先单独提交这一步，其他连接才能看到“已开始”（第 4.3 节）。
- 事务 2 再次锁定并核对（状态必须是 `running`，`job_name` 必须一致），在保存点内执行聚合，然后写入 `results`、`succeeded` 和 `finished_at`。聚合出错时回滚到保存点，同一事务内把行写为 `failed`。
- 时间用 `clock_timestamp()` 取实际时刻，不用事务开始时间 `now()`。
- 同一个 Job 被重复执行时（Kubernetes 不保证恰好一次），第二个进程在核对时发现状态已不是 `pending`，直接返回，不会覆盖已完成的结果。

#### 失败与卡住的处理

- `backoffLimit: 0`：工作进程失败一次，Job 就失败，不重试。这样 Job 的状态与报告行的状态一一对应，不会出现“行已写成 `failed`、Job 却在重试”的情况。用户可以重新提交一份报告。
- `activeDeadlineSeconds: 120`：Job 最多运行 2 分钟，超时由 Kubernetes 终止并标记 `Failed`（原因 `DeadlineExceeded`），所以每个 Job 一定会结束。
- `ttlSecondsAfterFinished: 3600`：结束 1 小时后 Job 及其 Pod 自动删除。
- `restartPolicy: Never`：容器退出后不在原 Pod 内重启。
- 查询时对账（`reconcileReport`）：如果 Pod 被强行杀掉，来不及把行写成 `failed`，报告会停在 `pending` 或 `running`。`GET /api/reports` 和 `GET /api/reports/{id}` 在返回前，对每条未结束且有 `job_name` 的报告查询对应的 Job：Job 带 `Failed=True` 条件时把报告标为 `failed`；Job 不存在且报告已提交超过 60 秒时标为 `failed`（“Report Job was not found”）；Kubernetes API 暂时不可用时不做任何改动。更新语句带条件 `id = ? AND job_name = <查到的 Job> AND status IN ('pending','running')`，工作进程刚好完成，或定时报告行已被更新的 Job 接管时，这次更新不匹配任何行，不会把别人的结果改成失败。

### 2.11 定时报告 CronJob

```yaml
# deploy/k8s/report-cronjob.yaml（节选）
spec:
  schedule: "*/2 * * * *" # demo cadence; production would use "5 0 * * *"
  timeZone: Asia/Shanghai
  concurrencyPolicy: Forbid # a slow run is never overlapped by the next one
  startingDeadlineSeconds: 60
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 0 # a failed worker is a failed Job; the report row records it
      activeDeadlineSeconds: 120
      ttlSecondsAfterFinished: 3600
```

| 字段                                                   | 取值            | 作用                                             |
| ------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `schedule`                                             | `*/2 * * * *`   | 每 2 分钟一次，便于在实验中观察                  |
| `timeZone`                                             | `Asia/Shanghai` | 调度按业务时区解释，与 `APP_TIME_ZONE` 一致      |
| `concurrencyPolicy`                                    | `Forbid`        | 上一次的 Job 还没结束时跳过本次调度              |
| `startingDeadlineSeconds`                              | 60              | 错过调度时刻超过 60 秒就放弃这一次，等下一个周期 |
| `successfulJobsHistoryLimit`、`failedJobsHistoryLimit` | 3、3            | 各保留最近 3 个 Job 供查看日志                   |

统计窗口：定时任务统计“从今天起的 7 天”，即 `[今天, 今天 + REPORT_WINDOW_DAYS - 1]`，“今天”按 `APP_TIME_ZONE` 计算（`scheduledWindow`）。窗口向前看而不是统计昨天，是因为系统不允许预约过去的时间，新部署的演示环境里“昨天”永远是空的；未来 7 天的占用情况对场地管理也更有用。

生产环境建议的周期是 `5 0 * * *`（`Asia/Shanghai`），即每天 00:05 运行一次：窗口按天滚动，一天生成一份就够；留出 5 分钟，避免任务恰好在日期切换的瞬间启动。届时 `activeDeadlineSeconds` 可按数据量放宽，其余设置不变。

避免任务重叠、重复写入和并发冲突的措施分四层：

1. 调度层：`concurrencyPolicy: Forbid` 保证同一个 CronJob 的两次运行不重叠，`activeDeadlineSeconds` 保证卡住的 Job 会被终止，不会一直挡住后面的调度。
2. 唯一键：部分唯一索引以统计区间 `(from_date, to_date)` 作为定时报告的周期键。工作进程用 `INSERT … ON CONFLICT … DO UPDATE` 写入，同一区间的再次运行更新同一行（把状态重置为 `pending` 并换上新的 `job_name`），不会产生重复记录。实验中每 2 分钟运行一次，当天的窗口不变，所以始终只有一条定时报告（第 3.5 节）。
3. 行锁：执行阶段的两个事务都先 `SELECT … FOR UPDATE` 锁定报告行，同一行上的并发执行被串行化。
4. 以 `job_name` 为条件的更新：upsert 只在 `job_name` 与本次 Job 不同时才重置该行，所以同一个 Job 被重复启动时不会把已完成的结果清空；写 `running`、`succeeded`、`failed` 的语句都带 `job_name` 条件，旧 Job 的进程或对旧 Job 的对账不会改动已被新 Job 接管的行。

手动报告每次插入新行，与定时报告写的不是同一行，两者互不影响。聚合本身是一条只读查询，与预约的创建和取消并发执行时读到的是一致的快照。

### 2.12 Fluent Bit 日志采集

```yaml
# deploy/k8s/fluent-bit-pipeline.yaml
service:
  flush: 1
  log_level: info

pipeline:
  inputs:
    - name: tail
      path: /var/log/containers/*_venue-booking_*.log
      # Fluent Bit's own stdout is a container log too; tailing it would feed back into itself.
      exclude_path: /var/log/containers/fluent-bit-*
      tag: kube.*
      multiline.parser: cri
      # Pick up new pods (api rollouts, report Jobs) within seconds instead of the 60 s default.
      refresh_interval: 5
      read_from_head: true

  filters:
    # Metadata comes from the file name (tag), so no API calls, ServiceAccount token or RBAC.
    - name: kubernetes
      match: kube.*
      kube_tag_prefix: kube.var.log.containers.
      use_tag_for_meta: on

  outputs:
    - name: stdout
      match: "*"
      format: json_lines
```

- 输入：只采集本命名空间的容器日志（文件名形如 `<Pod>_<命名空间>_<容器>-<容器 ID>.log`），并排除 Fluent Bit 自己的日志，否则它的输出又会被自己读入，形成循环。`multiline.parser: cri` 解析 containerd 的 CRI 日志格式。
- 元数据：`tag: kube.*` 让标签里带上完整文件路径，`kubernetes` 过滤器开启 `use_tag_for_meta` 后直接从标签（也就是文件名）解析出 Pod 名、命名空间和容器名，不调用 Kubernetes API。
- 因此不需要 RBAC：这个 DaemonSet 没有 ServiceAccount 令牌（`automountServiceAccountToken: false`），也没有任何 Role。代价是记录里没有 Pod 标签和注解，对本实验的用途（按 Pod 和容器区分日志）已经够用。撰写报告时复查它的启动日志，过滤器初始化时输出 `[filter:kubernetes:kubernetes.0] no network access required (OK)`。
- 输出：每条日志以一行 JSON 写到 Fluent Bit 自己的标准输出，用 `kubectl logs ds/fluent-bit` 查看。这只是为了演示，生产环境应改为输出到 Loki 或 OpenSearch，并为 `tail` 配置 `db` 偏移文件，避免重启后重复采集。
- `refresh_interval: 5` 和 `read_from_head: true`：报告 Job 的 Pod 只运行几秒，默认每 60 秒才扫描一次新文件，而且新发现的文件默认从末尾读起，会漏掉这类短命 Pod 的日志。
- 挂载与权限：节点的 `/var/log` 以 hostPath 只读挂载。容器日志文件属于 root 且权限为 0640，所以这个容器以 uid 0 运行，其余方面全部收紧：根文件系统只读，丢弃全部 capabilities，禁止提权，使用 `RuntimeDefault` seccomp。

### 2.13 安全说明

- 非 root 运行：`api` 和报告任务以 uid 1000（`node`）、`web` 以 uid 101（`nginx`）、`postgres` 以 uid 70 运行，清单用数字 uid 配合 `runAsNonRoot: true`，kubelet 可以在启动前校验。唯一的例外是 Fluent Bit（原因见上一节）。
- 所有容器都设置 `allowPrivilegeEscalation: false`、`capabilities.drop: [ALL]` 和 `RuntimeDefault` seccomp。
- 只有 `api` 的 Pod 挂载 ServiceAccount 令牌，其余 Pod 都关闭自动挂载。
- 只有 `web` 对集群外开放；数据库只有集群内的 Headless Service。
- 已知并接受的风险：`POST /api/reports` 没有身份认证，任何能访问前端入口的人都可以让集群创建 Job。RBAC 的 `create` 无法用 `resourceNames` 限定，所以 API 的 ServiceAccount 在权限上可以在本命名空间创建任意内容的 Job；一旦 API 进程被攻破，攻击者可以借此运行任意 Pod 并挂载数据库凭据。在课程实验的本地集群里我们接受这一点，单个 Job 的影响由 `activeDeadlineSeconds`、内存上限和 TTL 限定。
- 生产环境的缓解措施：给 API 加认证和限流；用 ResourceQuota 的 `count/jobs.batch` 限制命名空间内的 Job 数量；用 ValidatingAdmissionPolicy 限定该 ServiceAccount 只能创建使用指定镜像和命令的 Job；或者改为由常驻的工作进程消费任务队列，API 不再直接持有创建 Job 的权限。

## 3. 系统使用报告

本节的命令都在第 1.4 节的隧道地址 `http://127.0.0.1:57385` 上执行。时间线（东八区）：02:54:19 执行 `kubectl apply -k`；02:55:36 起验证业务流程；02:56:00 CronJob 第一次调度；02:56:02 提交手动报告；02:57 前后删除数据库 Pod、演示失败路径；02:58 拍摄截图；03:02 记录 CronJob 结果；03:04 完成端到端测试。

### 3.1 Lab 1 业务流程在 Kubernetes 上的运行

请求路径为 `curl` → 隧道 → Service `web` → nginx → Service `api` → 某个 API Pod → `postgres-0`。证据文件 `03-business-flows.txt` 保存了每一步的 `curl` 命令、响应状态行、`x-served-by` 头和 JSON，下面按顺序摘录，用 `#` 行说明该步对应的请求，省略了命令行本身。

```text
# 1. 查询场地列表（GET /api/venues）：返回启动时写入的 6 个演示场地
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-6rkp8
[
  {
    "id": 1,
    "name": "Aurora Lecture Hall",
    "location": "Teaching Building A, 1F",
    "capacity": 180,
    "openTime": "08:00",
    "closeTime": "22:00",
    "status": "open",
……
  },
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
  "location": "Building K, 2F",
  "capacity": 20,
  "openTime": "08:00",
  "closeTime": "22:00",
  "status": "open",
  "description": "Created on Kubernetes",
  "createdAt": "2026-11-11T18:55:36.281Z"
}

# 4. 创建预约（POST /api/reservations）：场地 1，11 月 13 日 09:00–10:30，得到预约 1
HTTP/1.1 201 Created
x-served-by: api-c8779bc78-8zsfk
{
  "id": 1,
  "venueId": 1,
……
  "bookerName": "Peng",
  "attendeeCount": 40,
  "date": "2026-11-13",
  "startTime": "09:00",
  "endTime": "10:30",
  "purpose": "Cloud native seminar",
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
{
  "id": 3,
  "venueId": 1,
……
}
……

# 7. 查询预约列表（GET /api/reservations）：返回预约 1、3、4、5，均为 confirmed
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-6rkp8
[
……
]

# 8. 取消预约 4（POST /api/reservations/4/cancel）
HTTP/1.1 200 OK
x-served-by: api-c8779bc78-8zsfk
{
  "id": 4,
  "venueId": 2,
……
  "date": "2026-11-15",
  "startTime": "13:00",
  "endTime": "15:00",
  "purpose": "Group meeting",
  "status": "cancelled",
  "createdAt": "2026-11-11T18:55:37.583Z",
  "cancelledAt": "2026-11-11T18:55:38.742Z"
}
……
```

- 实验要求保留的五项功能（查询场地列表和详情、创建场地、创建预约并检查冲突、查询预约记录、取消预约）都得到了预期的状态码和内容。
- 预约编号从 1 跳到 3：第 5 步被拒绝的插入已经从自增序列取走了编号 2，事务回滚不归还序列值。因此被取消的预约 4 属于场地 2（Seminar Room 305），这一点会影响第 3.4 节报告里场地 2 的数字。
- 冲突检测在多副本下仍然成立：预约 1 由 `api-c8779bc78-8zsfk` 写入，与它重叠的请求落在 `api-c8779bc78-6rkp8` 上并被拒绝。冲突由数据库的排他约束判定，与副本无关。
- 这几个响应的 `x-served-by` 已经出现了全部三个 API Pod。

### 3.2 浏览器中的业务页面

下面两张截图在中文浏览器环境下拍摄，截图宽 1440 像素。预约看板显示 7 个场地，其中 Lab 2 Demo Room 是第 3.1 节第 3 步创建的，页头多了“利用率报告”入口：

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

三类证据相互对应：

1. Service `api` 的 EndpointSlice 列出 3 个端点，正是三个 API Pod 的 IP（见第 1.6 节的 Pod 列表）；
2. 同一个地址连续请求 30 次，响应头 `x-served-by` 出现三个不同的 Pod 名，次数为 11、9、10；
3. 三个 Pod 各自的日志里都有 `GET /api/venues` 的记录，日志中的 `X-Served-By` 与 Pod 名一致。

### 3.4 一次性报告 Job

提交一份 11 月 13 日至 16 日的报告，范围正好覆盖第 3.1 节创建的预约：

```text
$ curl -s -X POST http://127.0.0.1:57385/api/reports -H 'content-type: application/json' -d '{"from":"2026-11-13","to":"2026-11-16"}'
{
    "id": 2,
    "trigger": "manual",
    "from": "2026-11-13",
    "to": "2026-11-16",
    "status": "pending",
    "jobName": "venue-report-manual-2-6a6b8",
    "createdAt": "2026-11-11T18:56:02.949Z",
    "startedAt": null,
    "finishedAt": null,
    "error": null,
    "results": null
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
Selector:                    batch.kubernetes.io/controller-uid=b8ef75e8-6d57-4e08-b71d-65f9e7bf976f
Labels:                      app.kubernetes.io/name=venue-report
                             venue-booking/report-id=2
……
Backoff Limit:               0
TTL Seconds After Finished:  3600
Start Time:                  Thu, 12 Nov 2026 02:56:03 +0800
Active Deadline Seconds:     120s
Pods Statuses:               1 Active (1 Ready) / 0 Succeeded / 0 Failed
Pod Template:
  Labels:  app.kubernetes.io/component=report
           app.kubernetes.io/name=venue-report
           app.kubernetes.io/part-of=venue-booking
……
           batch.kubernetes.io/job-name=venue-report-manual-2-6a6b8
……
           venue-booking/report-id=2
  Containers:
   report:
    Image:      venue-booking/api:2.0.0
……
    Command:
      node
      dist/report.js
    Limits:
      memory:  256Mi
    Requests:
      cpu:     50m
      memory:  96Mi
    Environment Variables from:
      app-config-5tdtccbhm6            ConfigMap  Optional: false
      postgres-credentials-c54md297kf  Secret     Optional: false
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
        {
            "venueId": 7,
            "venueName": "Lab 2 Demo Room",
            "reservationCount": 0,
            "bookedMinutes": 0
        }
    ]
}
```

- 唯一标识及其关联：API 返回报告编号 2 和 Job 名称 `venue-report-manual-2-6a6b8`；Job 上的标签 `venue-booking/report-id=2` 和环境变量 `REPORT_ID: 2` 指回同一份报告。编号是 2 而不是 1，是因为 02:56:00 的第一次定时任务已经先写入了报告 1（列表中的 `venue-report-29907056`）。
- 状态记录：提交时为 `pending`，`startedAt` 和 `finishedAt` 为空；完成后为 `succeeded`，`startedAt`（18:56:03.615Z）早于 `finishedAt`（18:56:03.636Z），从提交到完成不到 1 秒。`get jobs` 抓到的是 Job 还在 `Running` 的瞬间：工作进程写完结果后才退出，Job 控制器随后才把它记为完成。
- Job 的配置来自 CronJob 模板：镜像、`node dist/report.js` 命令、资源限制、`Backoff Limit: 0`、`Active Deadline Seconds: 120s`、`TTL Seconds After Finished: 3600`，以及同样的 ConfigMap 和 Secret 引用。输出里没有 `Controlled By` 一行，手动 Job 不属于 CronJob。
- 结果与第 3.1 节的数据一致：场地 1 有 2 条已确认预约，90 + 45 = 135 分钟；场地 3 有 1 条，30 分钟；场地 2 唯一的预约 4 已取消，所以是 0；包括停用的 Rooftop Garden 和新建的 Lab 2 Demo Room 在内，没有预约的场地都以 0 列出。

页面上的同一份报告（中文和英文界面）。左侧列表显示每份报告的状态、触发方式、范围、执行方（Job 名称）和时间，右侧是选中的第 2 号报告，135 分钟显示为“2 小时 15 分钟”：

![利用率报告页面（中文）](report-assets/lab2-01-reports-zh.png)

![利用率报告页面（英文）](report-assets/lab2-02-reports-en.png)

手机宽度（截图宽 390 像素）下结果表排在列表上方，图中选中的是定时生成的第 1 号报告（11 月 12 日至 18 日）：

![利用率报告页面（手机宽度）](report-assets/lab2-05-reports-mobile-zh.png)

### 3.5 定时报告 CronJob

```text
$ kubectl -n venue-booking get cronjob venue-report -o wide
NAME           SCHEDULE      TIMEZONE        SUSPEND   ACTIVE   LAST SCHEDULE   AGE     CONTAINERS   IMAGES                    SELECTOR
venue-report   */2 * * * *   Asia/Shanghai   False     0        15s             7m55s   report       venue-booking/api:2.0.0   <none>

$ kubectl -n venue-booking get cronjob venue-report -o jsonpath='{.spec}' (key fields)
{'schedule': '*/2 * * * *', 'timeZone': 'Asia/Shanghai', 'concurrencyPolicy': 'Forbid', 'startingDeadlineSeconds': 60, 'successfulJobsHistoryLimit': 3, 'failedJobsHistoryLimit': 3}
{'backoffLimit': 0, 'activeDeadlineSeconds': 120, 'ttlSecondsAfterFinished': 3600}

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

- CronJob 按 2 分钟的周期自动运行。Job 名称的后缀是调度时刻的分钟数：29907062 × 60 秒对应 2026-11-11T19:02:00Z，即东八区 03:02，与报告 1 的 `startedAt`（19:02:00.592Z）吻合；相邻 Job 的后缀相差 2。
- 到 03:02 为止共运行了 4 次（02:56、02:58、03:00、03:02），每次都是 `Complete 1/1`，用时 2 至 3 秒。列表里只剩最近 3 个，最早的 `venue-report-29907056` 已按 `successfulJobsHistoryLimit: 3` 被清理（它在第 3.4 节的 `get jobs` 输出和第 3.6 节的 Fluent Bit 日志中出现过）。
- 4 次运行写的是同一条记录：各 Job 的日志都是 `Report 1: succeeded`，API 里也只有一条 `scheduled` 报告，统计范围是 11 月 12 日至 18 日（当天起 7 天），`jobName` 是最近一次的 `venue-report-29907062`。02:58 拍摄的第 3.4 节截图里，同一条报告的执行方还是 `venue-report-29907058`。这就是第 2.11 节所说的“同一区间只更新一行”，重复运行没有产生重复数据。
- 第 1 号报告的内容见第 3.4 节的手机截图：在 11 月 12 日至 18 日的窗口内，场地 1 为 2 次、2 小时 15 分钟，场地 3 为 1 次、30 分钟，与手动报告一致。
- 报告 3 是第 3.11 节故意制造的失败记录。

### 3.6 DaemonSet：Fluent Bit 日志采集

```text
$ kubectl -n venue-booking get daemonset fluent-bit -o wide
NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE     CONTAINERS   IMAGES                    SELECTOR
fluent-bit   1         1         1       1            1           kubernetes.io/os=linux   2m45s   fluent-bit   fluent/fluent-bit:5.1.5   app.kubernetes.io/name=fluent-bit

$ kubectl -n venue-booking get pods -l app.kubernetes.io/name=fluent-bit -o wide
NAME               READY   STATUS    RESTARTS   AGE     IP            NODE       NOMINATED NODE   READINESS GATES
fluent-bit-2tvks   1/1     Running   0          2m46s   10.244.0.27   minikube   <none>           <none>

$ kubectl get nodes
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   68m   v1.37.0

$ kubectl -n venue-booking logs ds/fluent-bit | grep '"pod_name":"api-' | tail -2
{"date":1794423365.104989,"time":"2026-11-11T18:56:05.104988633Z","stream":"stdout","_p":"F","log":"GET /api/reports/2 200 2ms X-Served-By=api-c8779bc78-6rkp8","kubernetes":{"pod_name":"api-c8779bc78-6rkp8","namespace_name":"venue-booking","container_name":"api","docker_id":"6a4f80b8f2ed4a6a12affda3439636c9218b45e343941fff28a5e6b378f5d7da"}}
{"date":1794423425.239706,"time":"2026-11-11T18:57:05.239705807Z","stream":"stdout","_p":"F","log":"GET /api/reports 200 4ms X-Served-By=api-c8779bc78-6rkp8","kubernetes":{"pod_name":"api-c8779bc78-6rkp8","namespace_name":"venue-booking","container_name":"api","docker_id":"6a4f80b8f2ed4a6a12affda3439636c9218b45e343941fff28a5e6b378f5d7da"}}

$ kubectl -n venue-booking logs ds/fluent-bit | grep '"container_name":"report"' | tail -2
{"date":1794423360.722545,"time":"2026-11-11T18:56:00.722544864Z","stream":"stdout","_p":"F","log":"Report 1: succeeded","kubernetes":{"pod_name":"venue-report-29907056-7pz75","namespace_name":"venue-booking","container_name":"report","docker_id":"785c06c5ded4b0370e88c3d5b27e99f53a063256bb021c3aace62b590febb2a8"}}
{"date":1794423363.640532,"time":"2026-11-11T18:56:03.640531603Z","stream":"stdout","_p":"F","log":"Report 2: succeeded","kubernetes":{"pod_name":"venue-report-manual-2-6a6b8-zqlqg","namespace_name":"venue-booking","container_name":"report","docker_id":"5479aab23d698ca3c314f79fab3d869b19fcf968a5e51988fe56f19a6d80083f"}}
```

- 覆盖每个节点：集群有 1 个节点，DaemonSet 的 `DESIRED`、`CURRENT`、`READY`、`AVAILABLE` 都是 1，唯一的 Pod `fluent-bit-2tvks` 运行在节点 `minikube` 上。
- 任务执行结果：Fluent Bit 的输出里有 API 容器的请求日志和报告任务容器的日志，每条记录带有从文件名解析出的 `pod_name`、`namespace_name`、`container_name` 和容器 ID。
- 两个只运行了几秒的报告 Pod（定时的 `venue-report-29907056-7pz75` 和手动的 `venue-report-manual-2-6a6b8-zqlqg`）的日志也被采集到，时间与第 3.4 节一致，说明 `refresh_interval: 5` 对短命 Pod 有效。
- API 日志中的 `X-Served-By` 与 Fluent Bit 标注的 `pod_name` 相同，这也是多副本各自处理请求的旁证。

### 3.7 PVC 与数据持久化

```text
$ kubectl -n venue-booking get pvc,pv -o wide
NAME                                    STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE     VOLUMEMODE
persistentvolumeclaim/data-postgres-0   Bound    pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            standard       <unset>                 2m48s   Filesystem

NAME                                                        CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                           STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE     VOLUMEMODE
persistentvolume/pvc-50b33992-f354-4273-a20e-c7da62df31cd   1Gi        RWO            Delete           Bound    venue-booking/data-postgres-0   standard       <unset>                          2m47s   Filesystem

# 以下两条为撰写报告时复查（只读）：PVC 挂载在 /var/lib/postgresql，PG 18 的数据目录在其下的 18/docker
$ kubectl -n venue-booking exec postgres-0 -- sh -c 'grep /var/lib/postgresql /proc/mounts; ls /var/lib/postgresql/18/docker | head -5'
/dev/sde /var/lib/postgresql ext4 rw,relatime 0 0
PG_VERSION
base
global
pg_commit_ts
pg_dynshmem

$ kubectl get pv -o jsonpath='{.items[0].spec.hostPath.path}'   # minikube-hostpath 在节点上存放该卷的目录
/tmp/hostpath-provisioner/venue-booking/data-postgres-0

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

- PVC `data-postgres-0` 由 StatefulSet 自动创建，绑定到 StorageClass `standard` 动态制备的 1Gi PV。
- 数据目录确实在卷里：`/var/lib/postgresql/18/docker` 下是 PostgreSQL 18 的数据文件（`PG_VERSION`、`base`、`global` 等）。撰写报告时用 `kubectl describe pod postgres-0` 复查，容器的挂载为 `/var/lib/postgresql from data (rw)`，卷 `data` 的类型是 PersistentVolumeClaim，`ClaimName: data-postgres-0`。
- 删除 Pod 后，StatefulSet 创建了一个新的 Pod：名称仍是 `postgres-0`，UID 和 IP 都变了（`10.244.0.26` 变为 `10.244.0.30`），重启次数为 0，说明这是一个全新的 Pod 而不是原容器重启。
- 删除前后预约数量都是 4 条，数据没有丢失。之后的定时报告（02:58 起）、截图和端到端测试都运行在重建后的数据库上。

### 3.8 ConfigMap 与 Secret

```text
$ kubectl -n venue-booking get configmap/app-config-5tdtccbhm6 -o jsonpath={.data}
{"APP_TIME_ZONE":"Asia/Shanghai","DB_SEED_ON_START":"true","PORT":"3000","POSTGRES_DB":"venue_booking","REPORT_CRONJOB_NAME":"venue-report","REPORT_RUNNER":"kubernetes","REPORT_WINDOW_DAYS":"7"}
$ kubectl -n venue-booking describe secret/postgres-credentials-c54md297kf   (values are not printed by describe)
Name:         postgres-credentials-c54md297kf
Namespace:    venue-booking
Labels:       app.kubernetes.io/part-of=venue-booking
Annotations:  <none>

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

- ConfigMap 中是 7 个非敏感键，Secret 中只有用户名和密码两个键，`describe` 只显示长度。
- API 容器里的环境变量与 ConfigMap 一致；`DATABASE_URL` 已由 `$(VAR)` 展开为完整连接串（记录时把密码替换为 `****`），主机名是 Service 名 `postgres`。第 3.4 节 `describe job` 显示的则是展开前的模板，清单里没有明文密码。
- `REPORT_RUNNER=kubernetes` 让 API 通过 Job 执行报告；Compose 环境没有这个变量，报告在进程内执行。

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

- 三个 Service 的类型与设计一致：只有 `web` 有节点端口（31975），`api` 只有集群内的 ClusterIP，`postgres` 没有 ClusterIP。数据库端口没有以任何方式对集群外开放。
- `api` 的域名解析到 ClusterIP `10.100.232.44`，由 kube-proxy 分发到 3 个端点；Headless 的 `postgres` 直接解析到 Pod IP。
- `postgres-0.postgres.venue-booking.svc.cluster.local` 是 StatefulSet 提供的固定名称。这段输出记录于数据库 Pod 重建之后，EndpointSlice 和 DNS 都已指向新 IP `10.244.0.30`。
- 从 `web` 的 Pod 内按域名访问 API 的健康检查成功，API 又通过 `postgres` 这个名称连上了数据库。

### 3.10 RBAC 验证

Role 的实际内容（`kubectl -n venue-booking get role report-launcher -o yaml`）与第 2.10 节的清单一致。用 `kubectl auth can-i` 以 ServiceAccount 的身份逐项检查：

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

ServiceAccount `api` 只能读取 `venue-report` 这一个 CronJob、创建 Job，不能删除 Job、读取 Secret 或删除 Pod；其他 Pod 使用的 `default` 账号没有创建 Job 的权限。

### 3.11 失败路径：报告无法启动

为了验证失败状态的记录，临时删除 RoleBinding，使 API 失去调用 Kubernetes API 的权限，再请求一份报告，然后恢复：

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
    at Object.launch (file:///app/dist/server.js:18440:15)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
--
Error: Could not read report Job (HTTP 403)
    at Object.getJob (file:///app/dist/server.js:18454:15)

$ kubectl apply -k deploy/k8s
namespace/venue-booking unchanged
serviceaccount/api unchanged
role.rbac.authorization.k8s.io/report-launcher unchanged
rolebinding.rbac.authorization.k8s.io/report-launcher created
configmap/app-config-5tdtccbhm6 unchanged
……
deployment.apps/api configured
deployment.apps/web configured
statefulset.apps/postgres configured
cronjob.batch/venue-report unchanged
daemonset.apps/fluent-bit unchanged

$ kubectl -n venue-booking get rolebinding report-launcher
NAME              ROLE                   AGE
report-launcher   Role/report-launcher   1s
```

- 没有权限时，读取 CronJob 模板得到 403。API 按第 2.10 节的流程再确认一次该 Job 是否已存在（同样 403），然后把报告 3 记为 `failed`，`error` 为 “Report runner is unavailable”，`finishedAt` 有值而 `startedAt` 为空（任务从未开始），并向客户端返回 503 和错误码 `REPORT_RUNNER_UNAVAILABLE`。
- 失败的报告仍然保留编号和预先确定的 Job 名称 `venue-report-manual-3-3aec4`，可以在列表里追踪。
- 客户端看到的是不含内部细节的固定文案；具体原因（HTTP 403）写在 API 的日志里，供运维排查。
- 重新 `kubectl apply -k` 只补建了缺失的 RoleBinding。三个工作负载显示 `configured`，但没有发生滚动更新：撰写报告时复查，`api` 和 `web` 的 Pod 仍是第 1.6 节的那一批，`postgres-0` 仍是 02:57 重建的那一个，重启次数都是 0。

页面上失败的报告显示本地化的提示，下面附服务端的原因：

![失败的报告](report-assets/lab2-06-report-failed-zh.png)

### 3.12 自动化测试

```text
$ bun run typecheck && bun run lint && bun run format:check && bun run knip
@venue/contracts typecheck: Exited with code 0
@venue/api typecheck: Exited with code 0
@venue/web typecheck: Exited with code 0
$ oxlint
All matched files use the correct format.
Finished in 510ms on 139 files using 24 threads.
$ knip

$ bun run test:unit
 Test Files  5 passed (5)
      Tests  63 passed (63)

$ bun run test:integration   (disposable PostgreSQL 18 container)
 Test Files  4 passed (4)
      Tests  81 passed (81)

$ bunx vitest run tests/unit/reports.test.ts tests/integration/reports.test.ts --reporter=verbose   (report-related cases)
……
 ✓ |unit| tests/unit/reports.test.ts > buildReportJob > copies the template and targets the named report container without owner references
……
 ✓ |unit| tests/unit/reports.test.ts > Kubernetes launcher > uses bounded requests, rereads rotating tokens, and accepts an existing Job
……
 ✓ |integration| tests/integration/reports.test.ts > inline reports > aggregates confirmed bookings within both inclusive bounds and includes every venue
……
 ✓ |integration| tests/integration/reports.test.ts > inline reports > serialises duplicate executions and preserves the completed snapshot
 ✓ |integration| tests/integration/reports.test.ts > inline reports > commits running so another connection sees the start before aggregation finishes
……
 ✓ |integration| tests/integration/reports.test.ts > inline reports > upserts one scheduled row, skips a duplicate Job, and refreshes it for a new Job
 ✓ |integration| tests/integration/reports.test.ts > inline reports > serialises concurrent scheduled upserts for the same period
……
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > persists the Job name before launch and reconciles a failed Job on get
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > treats HTTP 409 when creating the pre-named Job as already launched
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > marks a launch failure failed and returns a sanitised 503
……
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > grants a missing Job 60 seconds, then fails unfinished rows on list
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > also recovers running rows after their Job is deleted
……
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > does not overwrite a worker that completes while reconciliation reads the Job
 ✓ |integration| tests/integration/reports.test.ts > Kubernetes reports > does not fail a newer scheduled execution after reading an older Job
 Test Files  2 passed (2)
      Tests  44 passed (44)

$ E2E_BASE_URL=http://127.0.0.1:57385 bun run test:e2e   (against the minikube deployment through `minikube service`)
  48 passed (1.1m)

$ E2E_BASE_URL=http://localhost:8080 bun run test:e2e   (Docker Compose stack, REPORT_RUNNER=inline)
  48 passed (52.1s)
```

- 类型检查、Oxlint、Oxfmt 和 Knip 全部通过。
- 单元测试 63 个、集成测试 81 个全部通过（Lab 1 时两者合计 96 个）。集成测试自动启动一个临时的 PostgreSQL 18 容器。
- 其中与报告相关的 44 个用例（单元 20 个、集成 24 个）覆盖了第 2.9 至 2.11 节的各项规则：统计口径、时区下的窗口计算、Job 清单的构造（不带属主引用）、令牌重读和超时、重复执行不覆盖结果、`running` 对其他连接可见、定时报告的 upsert 和并发、409 的处理、启动失败、Job 缺失 60 秒宽限、对账与工作进程的竞争。Kubernetes API 在这些测试中用假的 `fetch` 替代。
- Playwright 端到端测试 48 个，对 minikube 上的部署和 Docker Compose 部署各运行一遍，全部通过。其中 `tests/e2e/reports.spec.ts` 通过 API 创建场地和两条预约，在页面上提交报告，等待它变为 “Succeeded” 并核对该场地为 2 次、“2 h 15 min”，再做无障碍检查。在 Kubernetes 上这份报告由真实的 Job 完成，在 Compose 上由 API 进程内完成，页面的轮询逻辑对两者相同。Lab 1 原有的预约、冲突、取消等用例也在 Kubernetes 部署上全部通过。

### 3.13 实验要求对照

下表左列对应 `docs/lab-2.md` 第一部分的要求，右列指向本报告中的说明和验证位置。

| 实验要求 | 实现方式 | 位置 |
| -------- | -------- | ---- |
| 一、Kubernetes 环境、版本、节点数量、镜像使用方式 | minikube v1.39.0，Kubernetes v1.37.0，单节点；Compose 构建后 `minikube image load` | 1.1 至 1.3 |
| 二、保留 Lab 1 的五项业务功能 | 同一套 API 和前端迁移到 Kubernetes | 3.1、3.12 |
| 二、实际使用并说明 Deployment 和 StatefulSet | `api`、`web` 为 Deployment，`postgres` 为 StatefulSet | 2.2、2.3 |
| 3.1 Service 与访问方式，不依赖 Pod IP，不暴露数据库 | NodePort、ClusterIP、Headless 各一个，组件间用 DNS 名称 | 2.4、3.9 |
| 3.2 ConfigMap 与 Secret | `app-config`、`fluent-bit-config`；`postgres-credentials` | 2.6、3.8 |
| 3.3 持久化存储 | `volumeClaimTemplates` + StorageClass `standard`，删除 Pod 后数据仍在 | 2.7、3.7 |
| 3.4 多副本、Service、请求分布证据、副本数依据 | `api` 3 副本；`X-Served-By`、各 Pod 日志、EndpointSlice | 2.8、3.3 |
| 4.1 一次性报告 Job，唯一标识，开始、成功和失败状态，结果可查询 | API 创建 Job；报告编号与 Job 名称关联；`reports` 表和查询接口 | 2.9、2.10、3.4、3.11 |
| 4.2 CronJob，生产周期建议，避免重叠、重复写入和并发冲突 | `venue-report`，演示周期 2 分钟；`Forbid`、周期唯一键、行锁、带条件更新 | 2.11、3.5 |
| 4.3 DaemonSet，每个符合条件的节点一个 Pod | Fluent Bit 采集本命名空间容器日志 | 2.5、2.12、3.6 |
| 通用要求：配置与代码和镜像分离，不提交敏感信息 | ConfigMap 和 Secret 注入；`secret.env` 被 Git 忽略 | 2.6 |

## 4. 小组分工与问题解决

### 4.1 小组成员与分工

分工沿用 Lab 1 的三层划分，工作量大致相当：一人负责 API 一侧的报告逻辑以及它与 Kubernetes API 的交互，一人负责浏览器里的报告页面和端到端测试，一人负责清单、存储和部署验证。动手之前先在 `packages/contracts` 里定下报告接口，并约定好三方共用的名称（环境变量 `REPORT_ID`、`JOB_NAME`、`REPORT_RUNNER`，容器名 `report`，CronJob 名 `venue-report`，入口 `dist/report.js`），之后三部分并行完成。

| 成员 | 负责内容 | 主要代码与报告章节 | 完成情况 |
| ---- | -------- | ------------------ | -------- |
| 彭知书 | 后端报告功能：接口契约、`reports` 表和迁移、聚合查询、报告任务入口、通过 Kubernetes API 创建和查询 Job、查询时对账、`X-Served-By` 实例标识；与清单一侧核对 RBAC 权限和 Job 模板的约定 | `packages/contracts`、`apps/api/src/reports/`、`apps/api/src/report.ts`、`apps/api/src/routers/reports.ts`、`apps/api/drizzle/0002_*.sql`、`tests/unit/reports.test.ts`、`tests/integration/reports.test.ts`；报告第 2.9、2.10 节 | 已完成，并由第 3.4、3.11 节的运行记录和第 3.12 节的单元、集成测试核对 |
| 黄泓力 | 前端报告页面：日期表单与校验、报告列表和结果表、未结束时的轮询、失败提示、页头导航、中英文文案、手机宽度布局；报告页面的端到端测试 | `apps/web/src/features/reports/`、`apps/web/src/routes/reports/`、`apps/web/src/locales/`、`tests/e2e/reports.spec.ts`；报告第 3.4 节的页面部分 | 已完成，并由第 3.4、3.11 节的截图和第 3.12 节的 Playwright 测试核对 |
| 郑皓名 | Kubernetes 清单与部署：Kustomize 结构、StatefulSet 与 PVC、三个 Service、ConfigMap 和 Secret 生成、探针与资源配置、CronJob、Fluent Bit DaemonSet、RBAC 清单；在 minikube 上部署并采集证据 | `deploy/k8s/`、`docs/report-assets/lab2/`；报告第 1 节，第 2.2 至 2.8、2.11、2.12 节，第 3 节的命令记录 | 已完成，并由第 1.6 节的资源列表和第 3.3、3.5 至 3.10 节的记录核对 |

学号未写入本表，提交前由各位补在姓名后面即可。

生成式工具参与了部分设计讨论、实现、代码审查、排错和报告整理。提交前由对应负责人对照运行中的集群、第 3 节的命令输出和页面流程核对，而不是只看生成结果。三人交叉看过与自己模块相接的部分：彭知书核对 Job 模板里的容器名和环境变量是否与 API 代码的假设一致，黄泓力核对接口返回的状态和时间如何显示在页面上，郑皓名核对 API 实际发出的三个 Kubernetes 调用是否都在 Role 允许的范围内。

### 4.2 提交记录

Lab 1 提交之后的提交共 20 个（`git log --oneline 76bb86d..HEAD`）。其中 7 个是功能开发之前的依赖和构建维护，其余 13 个是本实验的功能：

| 提交 | 内容 |
| ---- | ---- |
| `aea2358`、`bee5850`、`44da341`、`5643601`、`8777955`、`8564c94` | 依赖升级：Oxfmt 0.78、Lighthouse CI 0.16、i18next 27 与 react-i18next 18、postgres 驱动 4.1、GitHub Actions 等 |
| `7e4d9e7` | 各工作区改用增量的 `tsc -b` 做类型检查 |
| `745e96d` | 接口契约：报告的数据结构和三个路由 |
| `38c632e`、`465b83d` | 前端报告页面及其端到端测试 |
| `88983d1` | 用 Kustomize 部署 `postgres`、`api`、`web` |
| `605d461` | CronJob `venue-report` |
| `c86d322` | Fluent Bit DaemonSet |
| `1f0820f` | Kubernetes 部署说明（`deploy/k8s/README.md`） |
| `3b2c8b9` | API 在响应头和日志中标识处理请求的 Pod |
| `feb53fe`、`6733bd2`、`c7b3e8e` | 报告的存储与聚合、报告任务入口、报告接口与 Job 的创建 |
| `8f9fd2a` | 报告相关的单元测试和集成测试 |
| `5cab93e` | 本次部署的命令输出和截图 |

### 4.3 问题与解决过程

- **`running` 状态从来看不到，开始时间等于结束时间。** 第一次真实部署时发现，报告总是从 `pending` 直接变成 `succeeded`，`startedAt` 与 `finishedAt` 完全相同。原因是最初把“标记开始”和“写入结果”放在同一个事务里：其他连接在提交前看不到 `running`，而 PostgreSQL 的 `now()` 返回事务开始时间。彭知书把执行拆成两个事务，先单独提交 `running` 和 `started_at`，再聚合并写结果，时间改用 `clock_timestamp()`。第 3.4 节中 `startedAt` 早于 `finishedAt`，集成测试 “commits running so another connection sees the start before aggregation finishes” 覆盖这一点。
- **手动报告可能永远停在 `pending`。** 设计评审时发现，如果先插入报告行、再创建 Job、最后回填 Job 名称，那么 API 在中间崩溃或创建请求超时后，报告行既没有 Job 名称可供对账，也没有 Job 会让它结束。彭知书改为在插入时就生成并保存 Job 名称，再用这个确定的名称创建 Job；409 视为已创建，查询时发现 Job 不存在超过 60 秒就把报告标为失败（第 2.10 节）。
- **工作进程失败后 Job 还会重试。** 最初的设计里 `backoffLimit` 是 1。设计评审时发现，工作进程出错时已把报告写成 `failed`，Kubernetes 却还会再启动一个 Pod，行状态和 Job 状态对不上。模板因此定为 `backoffLimit: 0`，一次失败即 Job 失败。
- **nginx 解析不到短名称 `api`。** Lab 1 中上游写的是 `http://api:3000`。在 Kubernetes 里短名称依赖 `/etc/resolv.conf` 的搜索域，而 nginx 的 `resolver` 不使用搜索域，照搬会解析失败。这一点在设计阶段就确认了，郑皓名在 `web` 的清单里把 `API_UPSTREAM` 设为完整域名 `http://api.venue-booking.svc.cluster.local:3000`，镜像和 nginx 模板不用改，Compose 仍使用默认值。
- **Fluent Bit 不访问 Kubernetes API 时拿不到 Pod 元数据。** 设计评审时发现只开启 `use_tag_for_meta` 不够：元数据是从标签里解析的，而 `tail` 输入默认的标签不含文件路径。郑皓名给输入加上 `tag: kube.*`，并让过滤器的 `kube_tag_prefix` 与之对应（`kube.var.log.containers.`）。这样 DaemonSet 不需要令牌和 RBAC，第 3.6 节的记录里有 Pod、命名空间和容器名。
- **Fluent Bit 可能漏掉报告 Job 的日志。** 审查清单时发现，报告 Pod 只运行两三秒，而 `tail` 默认每 60 秒才发现新文件，并且对启动时已存在的文件从末尾读起。部署前把配置改为 `refresh_interval: 5` 和 `read_from_head: true` 后，第 3.6 节可以看到两个报告 Pod 的输出。
- **数据库探针在初始化期间就会通过。** 审查清单时发现，PostgreSQL 镜像第一次启动时，会先起一个只监听 Unix 套接字的临时实例来执行初始化。不带 `-h` 的 `pg_isready` 走的正是套接字，探针会提前通过，Service 会在真正的实例监听 5432 端口之前就把 Pod 加入端点。郑皓名把三个探针都改为 `pg_isready -h 127.0.0.1`，只检查 TCP 端口。
- **Windows 上访问不到 NodePort。** docker 驱动下节点 IP 在 Docker Desktop 内部，主机路由不到。改用 `minikube service web -n venue-booking --url` 建立隧道，并在部署说明中注明该终端要保持打开（第 1.4 节）。
- **是否使用 Ingress。** minikube 的 ingress 插件安装的是 ingress-nginx，该项目已于 2026 年 3 月停止维护；`web` 里的 nginx 本来就负责 `/api` 路由。因此不引入 Ingress，对外只用一个 NodePort Service。
- **postgres 驱动 4.x 的原始模板不接受 `Date` 参数。** 报告的集成测试里有几处用驱动的原始模板直接改 `created_at`（模拟“报告已提交 60 秒”），传入 `Date` 对象时报错。彭知书把这些参数改为 `toISOString()` 的字符串；应用代码通过 Drizzle 写时间，不受影响。
- **i18next 27 的类型更严格。** 表单错误提示用动态键调用 `t(error, errorValues)`，没有插值参数时第二个参数是 `undefined`，新版本的类型定义不接受。黄泓力改为 `t(error, errorValues ?? {})`（`apps/web/src/components/form.tsx`）。
- **升级 Playwright 后端到端测试需要新的浏览器。** `@playwright/test` 升到 1.65 后，要重新执行 `playwright install chromium` 下载与之匹配的 Chromium，之后端到端测试才恢复全部通过。

## 5. 提交时间

本报告于 2026 年 11 月 12 日完成。报告提交截止时间为 2026/11/23，提交至 elearning。
