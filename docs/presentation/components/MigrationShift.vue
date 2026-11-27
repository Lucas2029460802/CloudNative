<script setup lang="ts">
type ShiftRow = {
  compose: string
  k8s: string
  impact: string
  accent?: boolean
}

const rows: ShiftRow[] = [
  {
    compose: "前后端单容器",
    k8s: "Deployment（web 2 / api 3 副本）",
    impact: "故障自动重建，后端可水平扩展",
  },
  {
    compose: "命名数据卷",
    k8s: "StatefulSet + 1 GiB PVC",
    impact: "Pod 重建后仍用原名并挂回原卷",
  },
  {
    compose: ".env 文件",
    k8s: "ConfigMap + Secret",
    impact: "普通配置与密码分离，不进镜像",
  },
  {
    compose: "无后台任务",
    k8s: "CronJob、Job、DaemonSet",
    impact: "新增定时报告与节点日志采集",
  },
  {
    compose: "服务名直连 api",
    k8s: "Service 集群 DNS",
    impact: "nginx 解析短名 api 失败，返回 502",
    accent: true,
  },
]
</script>

<template>
  <div class="shift-list caption" aria-label="Compose 到 Kubernetes 的五处变化">
    <div class="shift-head">
      <span class="col-compose">Compose 做法</span>
      <span class="col-arrow" aria-hidden="true" />
      <span class="col-k8s">Kubernetes 对象</span>
      <span class="col-impact">带来的变化</span>
    </div>

    <div
      v-for="row in rows"
      :key="row.compose"
      class="shift-row"
      :class="{ 'is-accent': row.accent }"
    >
      <span class="col-compose">{{ row.compose }}</span>
      <span class="col-arrow" aria-hidden="true">
        <svg viewBox="0 0 36 16" width="36" height="16" fill="none">
          <path
            d="M 2 8 Q 16 7.2, 30 8"
            :stroke="row.accent ? '#dc5f0c' : '#4b4741'"
            :stroke-width="row.accent ? 2.4 : 1.7"
            stroke-linecap="round"
          />
          <path
            d="M 24 3.5 L 31 8 L 24 12.5"
            :stroke="row.accent ? '#dc5f0c' : '#4b4741'"
            :stroke-width="row.accent ? 2.4 : 1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="col-k8s">{{ row.k8s }}</span>
      <span class="col-impact">
        <span class="impact-text">{{ row.impact }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.shift-list {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.shift-head,
.shift-row {
  display: grid;
  grid-template-columns: 142px 38px 292px 1fr;
  align-items: center;
  column-gap: 12px;
  padding: 13px 0;
}

.shift-head {
  padding-top: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ink);
  color: var(--ink-2);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.shift-row {
  border-bottom: 1px solid rgba(29, 27, 24, 0.18);
  color: var(--ink);
  font-size: 18px;
  line-height: 1.4;
}

.shift-row .col-compose {
  color: var(--ink-2);
}

.shift-row .col-k8s {
  color: var(--ink);
  font-weight: 700;
}

.shift-row .col-impact {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  color: var(--ink-2);
}

.col-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.shift-row.is-accent {
  background: rgba(220, 95, 12, 0.08);
  border-bottom: 1px solid rgba(29, 27, 24, 0.35);
}

.shift-row.is-accent .col-compose,
.shift-row.is-accent .col-k8s,
.shift-row.is-accent .col-impact {
  color: var(--ink);
  font-weight: 700;
}

.impact-text {
  white-space: nowrap;
}
</style>
