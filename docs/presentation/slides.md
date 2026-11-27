---
theme: default
title: 场地预约系统：从 Docker Compose 到 Kubernetes
info: 云原生软件技术 Lab 2 课堂汇报
canvasWidth: 980
aspectRatio: 16/9
colorSchema: light
fonts:
  provider: none
  sans: Noto Sans SC
  mono: JetBrains Mono
transition: fade
duration: 10min
timer: countdown
drawings:
  enabled: false
routerMode: hash
layout: cover
---

# 从 Docker Compose 到 Kubernetes

<p class="cover-sub">场地预约系统的部署迁移</p>

<p class="meta" data-check-allow="rule8-chars">《CS30074 云原生软件技术》课程汇报，2026 年 11 月 30 日<br>彭知书<span class="sid">23300660010</span><br>黄泓力<span class="sid">24340240003</span><br>郑皓名<span class="sid">23340240063</span></p>

<script setup>
import cat from "./assets/cat.svg?inline"
</script>

<img class="cat" :src="cat" alt="" />

<style scoped>
.cover-sub {
  color: var(--ink) !important;
  font-size: 24px;
  line-height: 1.4;
}

.sid {
  display: inline-block;
  margin-left: 14px;
  font-variant-numeric: tabular-nums;
}
</style>

<!--
[0:00]
老师、同学们好。今天我们汇报校园场地预约系统从 Docker Compose 迁移到 Kubernetes 的过程，包括系统简介、迁移方案、工作负载、现场演示、排错过程和成员分工。
-->

---

# 这是一套校园场地预约系统

<div class="cols intro-main">
  <div class="col-grow intro-text">
    <ul>
      <li>按时段预约，提交后生成编号</li>
      <li>时间冲突由数据库直接拒绝</li>
      <li>取消后时段立即释放</li>
    </ul>
  </div>
  <Shot
    src="demo-02-confirmed"
    alt="预约成功页面"
    :tilt="0"
    :zoom="176"
    :pos-x="50"
    :pos-y="44"
    frame-width="480px"
    frame-height="268px"
  />
</div>

<TechStack />

<style scoped>
.intro-main {
  flex: 1 1 auto;
  align-items: center;
  margin-bottom: 12px;
}

.intro-text :deep(li) {
  margin-bottom: 20px;
}
</style>

<!--
[0:20]
这套系统用于校园场地预约：用户选定日期和空闲时段，提交后获得预约编号；重叠预约由数据库排他约束直接拒绝；取消后该时段立即恢复可订。Lab 2 在此基础上新增了场地利用率报告。下方是技术栈：前端用 React、TanStack、Tailwind 和 Vite，接口用 oRPC 和 Zod 共用契约，后端用 Node.js 跑 Hono，Drizzle 连接 PostgreSQL，Bun 构建，通过 nginx、Docker 和 Kubernetes 部署。
-->

---
layout: divider
no: "01"
label: 迁移
---

<!--
[1:00]
第一部分看系统如何从 Docker Compose 迁移到 Kubernetes。
-->

---
clicks: 4
pageNumber: false
---

<ArchMorph />

# 同样的三个服务，改由 Kubernetes 来运行

<!--
[1:05]
Lab 1 三个容器跑在同一台 Docker 主机上，前端暴露 8080，内部按服务名互通。
[click]
迁移到 Kubernetes 后，web 和 api 改为 2 副本和 3 副本的 Deployment，配 NodePort 和 ClusterIP。
[click]
数据库改用 1 副本 StatefulSet、无头 Service 和 1 GiB 持久卷。
[click]
.env 拆成 ConfigMap 和 Secret，密码单独保存。
[click]
再补上报告 CronJob、Job 和节点日志 DaemonSet。
-->

---

# 迁移到 Kubernetes，真正变了什么

<MigrationShift />

<p class="map-note">原预约代码与镜像不变，部署由 <code>deploy/k8s/</code> 清单定义。</p>

<style scoped>
.map-note {
  margin: 22px 0 0;
  color: var(--ink);
  font-size: 18px;
  line-height: 1.5;
}

.map-note code {
  font-size: 18px;
}
</style>

<!--
[2:00]
刚才的架构图展示了对象怎么挪进集群，这一页看迁移真正带来的五处变化：前后端从各跑一个单容器变成多副本 Deployment，故障自动重建并支持水平扩展；数据库加上 StatefulSet 和 1 GiB 持久卷，Pod 重建后仍用原名并挂回原卷；.env 拆成 ConfigMap 和 Secret，密码不再进镜像和仓库；集群里新增了定时报告 CronJob、Job 和节点日志 DaemonSet；最后一行也是最容易踩坑的地方——服务间从 Compose 的服务名直连变成集群 DNS，nginx 动态解析短域名 api 导致我们迁移初期全部返回 502，稍后排错会详细复盘。整个迁移沿用原预约代码和镜像，部署由 deploy/k8s/ 清单定义。
-->

---
layout: divider
no: "02"
label: 工作负载
---

<!--
[2:30]
接下来看第二部分：工作负载的选型和运行结果。
-->

---

# 六个组件对应五种工作负载

<div class="cols wl-grid">
<div class="wl-left">

| 服务或任务 | 工作负载 | 原因 |
| --- | --- | --- |
| api | Deployment（3 副本） | 无状态，可水平扩展 |
| web | Deployment（2 副本） | 无状态，副本可替换 |
| postgres | StatefulSet（1 副本） | 固定名称与持久卷 |
| 手动报告 | Job | 运行一次即退出 |
| 定时报告 | CronJob | 按计划定时触发 |
| Fluent Bit | DaemonSet | 每节点运行一个 |

</div>
<div class="wl-right">
  <ReplicaChart />
</div>
</div>

<style scoped>
.wl-grid {
  align-items: flex-start;
  gap: 28px;
}

.wl-left {
  flex: 0 0 476px;
}

.wl-left :deep(th),
.wl-left :deep(td) {
  padding: 12px 14px 12px 0;
  font-size: 17px;
  white-space: nowrap;
}

.wl-left :deep(th:last-child),
.wl-left :deep(td:last-child) {
  padding-right: 0;
}

.wl-left :deep(td:nth-child(2)) {
  font-weight: 700;
}

.wl-left :deep(tbody tr:first-child td) {
  background: rgba(220, 95, 12, 0.08);
  font-weight: 700;
}

.wl-left :deep(tbody tr:first-child td:first-child) {
  padding-left: 6px;
}

.wl-left :deep(tbody tr:first-child td:last-child) {
  padding-right: 6px;
}

.wl-right {
  flex: 0 0 348px;
}
</style>

<!--
[2:35]
六个组件按运行特征选了五种工作负载：Deployment、StatefulSet、Job、CronJob 和 DaemonSet。右侧对应第一行的 api 实测结果：api 3/3、web 2/2、postgres 1/1 全部就绪；连续向 /api/venues 发 30 次请求并统计 X-Served-By 响应头，三个后端副本分别处理了 11、9 和 10 次，共同分担流量。这五种工作负载里，只有一种必须记住数据，下一页看数据库为什么不能用 Deployment。
-->

---

# 数据库 Pod 删了重建，名字和数据都还在

<StatefulDiagram />

<p class="sts-note"><code>web</code> 和 <code>api</code> 可随时替换，数据库靠持久卷留住数据。</p>

<style scoped>
.sts-note {
  margin: 0;
  font-size: 19px;
}

.sts-note code {
  font-size: 18px;
}
</style>

<!--
[3:10]
web 和 api 是无状态的，Pod 挂了直接换一个新的就行；但数据库不一样，必须保住预约数据，所以我们用 1 副本 StatefulSet 配 1 GiB 持久卷。实测执行 kubectl delete pod postgres-0 后，新 Pod 的 IP 从 10.244.0.26 变成 10.244.0.30，但名字依然是 postgres-0，并自动重新挂载原来的 data-postgres-0 持久卷（挂载点 /var/lib/postgresql），4 条预约记录完好无损。因为 PostgreSQL 是单主写入，多副本需要主从复制，这里只运行 1 个实例（若被问到服务发现：配了无头 Service postgres 提供稳定名称）。数据保住了，接下来谁定时把它读出来做统计？CronJob。
-->

---

# 定时和手动报告都由 Job 执行

<ReportFlow />

<p class="rf-note">定时交给 CronJob，避免 3 个 API 副本重复执行。</p>

<style scoped>
.rf-note {
  margin: 0;
}
</style>

<!--
[3:35]
后端有 3 个副本，如果在 API 进程里放定时器会重复触发 3 次，因此交给 CronJob 每 2 分钟统一调度，并设置 concurrencyPolicy 为 Forbid 跳过重叠执行。用户在页面手动生成报告时，API 复制同一份 Job 模板创建一次性 Job。报告状态经等待、执行中落到已完成或失败，查询时核对 Job 状态防止卡住。实测连续 4 次定时任务全部正常完成。
-->

---
layout: divider
no: "03"
label: 现场演示
---

<DemoCues />

<!--
[4:00]
现在切到浏览器进行现场演示，依次展示三个场景：预约成功、冲突拒绝和取消后重新预约。集群和端口转发已经就绪。

[4:15] 场景一：预约成功。
选 Aurora Lecture Hall 和 12 月 1 日，把网址复制到第二个标签页备用。回到第一页点选 14:00 到 15:00，填机器人社、20 人、每周例会并提交，页面返回预约编号 1。

[5:05] 场景二：冲突拒绝。
切到第二页，时间表已显示机器人社的预约。在下拉框再选 14:00 到 15:00，前端提示重叠但仍允许提交，填棋社、10 人、比赛提交后，后端直接返回冲突并给出下一可用时段 15:00 到 16:00。冲突由数据库排他约束判断，3 个副本结果一致。

[6:00] 场景三：取消后重新预约。
回第一页取消编号 1，状态变为已取消。回第二页再提交，棋社预约成功。打开预约记录：编号 1 已取消，编号 3 已确认，编号 2 被冲突提交消耗。演示完毕，切回幻灯片。
-->

---

# 故障复盘：刚迁移时 /api/ 全返回 502

<div class="prob-head caption">
  <span class="prob-title">nginx 错误日志</span>
  <span class="prob-hint">所有 <code>/api/</code> 请求返回 502</span>
</div>

<pre class="log-pre"><code><span class="log-hit">[error]</span> <span class="log-hit">api could not be resolved</span> (2: Server failure)</code></pre>

<div class="prob-head prob-gap caption">
  <span class="prob-title"><code>deploy/web/default.conf.template</code></span>
  <span class="prob-hint">后端地址来自环境变量 <code>API_UPSTREAM</code></span>
</div>

```nginx
resolver ${NGINX_LOCAL_RESOLVERS} valid=10s ipv6=off;
set $api_upstream ${API_UPSTREAM};
location /api/ { proxy_pass $api_upstream; }
```

<p class="prob-takeaway">
  nginx 内置 <code>resolver</code> 不会自动补全集群域名后缀，<br>短域名 <code>api</code> 解析失败。
</p>

<style scoped>
.prob-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 8px;
  line-height: 1.4;
}

.prob-title {
  color: var(--ink);
  font-size: 18px;
  font-weight: 700;
}

.prob-title code {
  padding: 0;
  font-size: 18px;
  font-weight: 700;
}

.prob-hint {
  color: var(--ink-2);
  font-size: 16px;
}

.prob-hint code {
  padding: 0 2px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}

.prob-gap {
  margin-top: 20px;
}

.log-pre {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid rgba(29, 27, 24, 0.24);
  background: #f9f8f5;
  color: var(--ink);
  font-family: "JetBrains Mono", monospace;
  font-size: 19px;
  line-height: 1.55;
  overflow-x: hidden;
}

.log-hit {
  padding: 1px 4px;
  background: rgba(220, 95, 12, 0.14);
  color: var(--ink);
  font-weight: 700;
}

:deep(pre),
:deep(pre code) {
  font-size: 19px !important;
  line-height: 1.55 !important;
}

.prob-takeaway {
  margin: 22px 0 0;
}
</style>

<!--
[7:00]
现场演示已经跑通了，下面复盘迁移初期遇到的一个实际故障。刚上 Kubernetes 时，所有 /api/ 请求都返回 502，nginx 错误日志只有一行：api could not be resolved。平时 Pod 里访问 api，系统会自动补全 .venue-booking.svc.cluster.local 后缀；但 Lab 1 为了动态解析开了 nginx 内置 resolver，它不会自动补后缀，直接查 api 就 502 了。
[Q&A 补充机制：nginx 内置 resolver 不读取 /etc/resolv.conf 里的 search 搜索域，而普通进程通过系统库解析时会按搜索域依次补全命名空间和集群域名后缀。]
-->

---

# 把后端地址改成完整集群域名

<div class="fix-wrap" data-check-allow="rule2-contrast">
<p class="fix-label"><code>deploy/k8s/web.yaml</code></p>

````md magic-move
```yaml
env:
  - name: API_UPSTREAM
    value: http://api:3000
```
```yaml
env:
  - name: API_UPSTREAM
    value: http://api.venue-booking.svc.cluster.local:3000
```
````

<p v-click="1" class="fix-takeaway">
  只改一行配置，不用重新构建镜像。
</p>
</div>

<style scoped>
.fix-wrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 36px;
}

.fix-label {
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
}

.fix-label code {
  font-size: 17px;
  font-weight: 700;
}

.fix-wrap :deep(.shiki-magic-move-container),
.fix-wrap :deep(.shiki-magic-move-container code) {
  padding: 16px 20px !important;
  font-size: 20px !important;
  line-height: 1.55 !important;
}

.fix-wrap :deep(.shiki-magic-move-container code) {
  padding: 0 !important;
}

.fix-takeaway {
  margin: 28px 0 0;
}
</style>

<!--
[7:45]
解决办法很直接。在 deploy/k8s/web.yaml 里，原来沿用 Lab 1 的配置是 http://api:3000。
[click]
我们把 API_UPSTREAM 改成完整集群域名 http://api.venue-booking.svc.cluster.local:3000。带上命名空间和集群后缀后，nginx 直接解析到 api Service，接口马上恢复正常。只改一行配置，不用重新构建镜像，原有的 Lab 1 Docker Compose 部署也不受影响。
-->

---

# 成员分工

<TeamSummary />

<!--
[8:30]
回顾一下整套迁移的结果：三个 API 副本共同处理了请求，数据库 Pod 重建后 4 条预约完好无损，一行完整集群域名配置也解决了 502 转发故障。最后简要介绍成员分工：彭知书负责后端接口、业务规则和报告任务调度；黄泓力负责前端预约页面、报告页面和端到端测试；郑皓名负责数据库、Docker 容器镜像以及 Kubernetes 清单与部署运维。汇报主体到这里结束，下面跳到最后一页致谢（按 G，输入 24 后回车）。
-->

---
backup: true
---

# Kubernetes 上的预约看板

<Shot
  src="lab2-03-board-zh"
  alt="Kubernetes 上的预约看板"
  :tilt="0"
  :zoom="114"
  :pos-x="50"
  :pos-y="32"
  frame-width="852px"
  frame-height="332px"
  caption="共 7 个场地，图中是前 3 个的开放时间与容量。"
/>

<!--
[备用]
演示备用图：Kubernetes 上运行的预约看板，共 7 个场地（图中展示前 3 个），显示开放时间、容量和下一段可用时段。
-->

---
backup: true
---

# 场景一：选定时间并填写预约

<div class="cols demo-split">
  <Shot
    src="demo-01-selected"
    alt="选好时段并填写预约信息"
    :tilt="0"
    :zoom="122"
    :pos-x="50"
    :pos-y="58"
    frame-width="556px"
    frame-height="336px"
  />
  <div class="col-grow demo-points">
    <ul>
      <li>Aurora Lecture Hall</li>
      <li>12 月 1 日 14:00–15:00</li>
      <li>机器人社，20 人，每周例会</li>
    </ul>
  </div>
</div>

<style scoped>
.demo-split {
  align-items: center;
  gap: 32px;
}

.demo-points :deep(li) {
  margin-bottom: 22px;
  font-size: 18px;
}
</style>

<!--
[备用]
演示备用图（场景一）：在 Aurora Lecture Hall 选中 12 月 1 日 14:00 到 15:00，填写预约人机器人社、20 人、用途每周例会后提交。
-->

---
backup: true
---

# 场景一：预约成功并生成编号

<div class="cols demo-card-split">
  <Shot
    src="demo-02-confirmed"
    alt="预约成功"
    :tilt="0"
    :zoom="172"
    :pos-x="50"
    :pos-y="63"
    frame-width="412px"
    frame-height="340px"
  />
  <div class="col-grow demo-card-points">
    <ul>
      <li>返回预约编号 1，状态已确认</li>
      <li>12 月 1 日 14:00–15:00</li>
      <li>机器人社 20 人，每周例会</li>
    </ul>
  </div>
</div>

<style scoped>
.demo-card-split {
  align-items: center;
  gap: 40px;
}

.demo-card-points :deep(li) {
  margin-bottom: 22px;
}
</style>

<!--
[备用]
演示备用图（场景一）：预约成功，页面显示预约编号 1、已确认状态和完整预约详情。
-->

---
backup: true
---

# 场景二：棋社的冲突预约被拒绝

<div class="cols conflict-wrap">
  <Shot
    src="demo-03-conflict"
    alt="冲突预约被拒绝"
    :tilt="0"
    :zoom="250"
    :pos-x="95"
    :pos-y="75"
    frame-width="290px"
    frame-height="352px"
  />
  <div class="col-grow conflict-points">
    <ul>
      <li>前端提示时段重叠，但仍允许提交</li>
      <li>数据库排他约束拦截，接口返回 409</li>
      <li>提示下一可用时段：15:00–16:00</li>
    </ul>
  </div>
</div>

<style scoped>
.conflict-wrap {
  align-items: center;
  gap: 44px;
}

.conflict-points :deep(li) {
  margin-bottom: 22px;
}
</style>

<!--
[备用]
演示备用图（场景二）：第二个标签页中棋社提交同一时段，前端提示后仍允许提交，后端靠数据库排他约束返回 409 并给出下一可用时段 15:00–16:00。
-->

---
backup: true
---

# 场景三：取消预约并释放时段

<div class="cols demo-card-split">
  <Shot
    src="demo-04-cancelled"
    alt="预约已取消"
    :tilt="0"
    :zoom="172"
    :pos-x="50"
    :pos-y="48"
    frame-width="412px"
    frame-height="340px"
  />
  <div class="col-grow demo-card-points">
    <ul>
      <li>编号 1 状态变为已取消</li>
      <li>14:00–15:00 时段立即释放</li>
      <li>取消时间与记录保留可查</li>
    </ul>
  </div>
</div>

<style scoped>
.demo-card-split {
  align-items: center;
  gap: 40px;
}

.demo-card-points :deep(li) {
  margin-bottom: 22px;
}
</style>

<!--
[备用]
演示备用图（场景三）：在第一个标签页确认取消编号 1 的预约，页面状态变为已取消，时段立即释放。
-->

---
backup: true
---

# 场景三：取消后重新预约成功并保留记录

<Shot
  src="demo-05-reservations"
  alt="预约记录"
  :tilt="0"
  :zoom="115"
  :pos-x="50"
  :pos-y="91"
  frame-width="852px"
  frame-height="242px"
  caption="重新预约成功：编号 1 已取消，编号 3 已确认。"
/>

<!--
[备用]
演示备用图（场景三）：取消后棋社重新提交 14:00–15:00 成功，预约记录页显示编号 1 已取消、编号 3 已确认（此前冲突提交回滚时仍消耗了数据库自增序列号 2）。
-->

---
backup: true
---

# 定时与手动生成的场地利用率报告

<div class="cols report-shot-split">
  <Shot
    src="lab2-01-reports-zh"
    alt="利用率报告页面"
    :tilt="0"
    :zoom="116"
    :pos-x="50"
    :pos-y="75"
    frame-width="580px"
    frame-height="336px"
  />
  <div class="col-grow report-shot-points">
    <ul>
      <li>上方选日期，手动触发 Job</li>
      <li>左下列出定时与手动任务</li>
      <li>右下展示各场地预约统计</li>
    </ul>
  </div>
</div>

<style scoped>
.report-shot-split {
  align-items: center;
  gap: 32px;
}

.report-shot-points :deep(li) {
  margin-bottom: 22px;
  font-size: 18px;
}
</style>

<!--
[备用]
演示备用图：利用率报告页面，上方可以选择日期并点击生成报告触发手动 Job，左下列出 CronJob 定时生成和手动触发的 Job 名称与状态，右下展示第 2 号报告的场地预约次数与已预约时长统计表。
-->

---
backup: true
---

<div class="future-wrap">
  <p class="future-eyebrow">未来演进</p>

# 如果把后端拆成微服务？

  <svg class="future-rule" viewBox="0 0 468 16" width="468" height="16" fill="none" aria-hidden="true">
    <path d="M 2 9 Q 150 3, 310 10 Q 395 13, 466 6" stroke="#dc5f0c" stroke-width="2.6" stroke-linecap="round" />
    <path d="M 10 12.5 Q 190 7.5, 456 10.5" stroke="#dc5f0c" stroke-width="1.1" stroke-linecap="round" opacity="0.5" />
  </svg>
  <p class="future-sub">课堂讨论：按业务能力拆分与一致性权衡</p>
</div>

<style scoped>
.future-wrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 24px;
}

.future-eyebrow {
  margin: 0 0 14px;
  color: var(--ink-2);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.future-wrap :deep(h1) {
  margin: 0 0 14px;
  font-size: 44px;
}

.future-rule {
  display: block;
  margin: 0 0 22px;
}

.future-sub {
  margin: 0;
  color: var(--ink-2);
  font-size: 20px;
}
</style>

<!--
[备用]
如果课堂讨论问到后续演进方向：下面两页说明如果需求继续增长，后端如何按业务能力拆分为微服务，以及拆库带来的改动与一致性权衡。
-->

---
backup: true
---

# 后端可按业务能力拆成三个服务

<MicroserviceSplit />

<p class="caption ms-foot">后续还可按需要拆出用户服务和通知服务。</p>

<style scoped>
.ms-foot {
  margin: 0;
}
</style>

<!--
[备用]
目前的后端是容器化单体，场地、预约、报告都在一个 Node.js 进程里并共用一个数据库，3 副本属于 X 轴扩展。按业务能力做 Y 轴拆分时，沿用现有的 /venues、/reservations、/reports 边界拆成场地服务、预约服务和报告服务，各自拥有独立数据库，nginx 改作 API 网关按路径转发，未来还可以继续拆出用户服务和通知服务。
-->

---
backup: true
---

# 拆库后的三处改动与一致性权衡

<MicroserviceChanges />

<p class="ms-note">时段冲突仍由预约库排他约束保证；现阶段保持单体更合适。</p>

<style scoped>
.ms-note {
  margin: 0;
  font-size: 19px;
}
</style>

<!--
[备用]
拆分后原来单库事务直接关联查询的三处逻辑都要改：预约时查询场地改为同步调用或订阅事件维护本地副本，取消跨库外键改由预约服务校验，报告统计改为 API 组合模式分别调用两个服务再汇总。一致性方面，预约冲突检查留在预约库排他约束里保持强一致，场地副本采用最终一致。由于目前系统规模小、需求仍在变化，现阶段保持单体更合适，等业务稳定后再按这条边界拆分。
-->

---
backup: true
pageNumber: false
---

<div class="closing-wrap">

# 谢谢，欢迎提问

</div>

<script setup>
import cat from "./assets/cat.svg?inline"
</script>

<img class="closing-cat" :src="cat" alt="" />

<style scoped>
.closing-wrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  padding-bottom: 24px;
}

.closing-wrap :deep(h1) {
  margin-bottom: 0;
  font-size: 46px;
}

.closing-cat {
  position: absolute;
  right: 72px;
  bottom: 56px;
  width: 150px;
}
</style>

<!--
[9:00]
汇报结束，谢谢老师和同学，欢迎提问。
-->
