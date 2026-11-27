<script setup lang="ts">
const replicas = [
  { name: "api-1", count: 11, x: 56 },
  { name: "api-2", count: 9, x: 146 },
  { name: "api-3", count: 10, x: 236 },
]

const maxCount = 12
const chartTop = 28
const chartBottom = 188
const chartHeight = chartBottom - chartTop
const barWidth = 60
const avgY = Math.round(chartBottom - (10 / maxCount) * chartHeight)

function barHeight(count: number): number {
  return Math.round((count / maxCount) * chartHeight)
}

function barY(count: number): number {
  return chartBottom - barHeight(count)
}
</script>

<template>
  <div class="replica-panel caption">
    <p class="panel-title">30 次请求分布（响应头 <code>X-Served-By</code>）</p>
    <svg
      viewBox="0 0 348 224"
      width="348"
      height="224"
      role="img"
      aria-label="30 次请求在三个 api 副本上的分布结果：api-1 为 11 次，api-2 为 9 次，api-3 为 10 次"
    >
      <!-- Reference line at mean (10), drawn behind bars -->
      <line
        x1="14"
        :y1="avgY"
        x2="344"
        :y2="avgY"
        stroke="#4b4741"
        stroke-width="1.4"
        stroke-dasharray="5 5"
        stroke-opacity="0.72"
      />
      <text x="344" :y="avgY - 8" text-anchor="end" class="ref-label">
        均值 10
      </text>

      <!-- Three API replica columns -->
      <g v-for="item in replicas" :key="item.name">
        <rect
          :x="item.x - barWidth / 2"
          :y="barY(item.count)"
          :width="barWidth"
          :height="barHeight(item.count)"
          fill="#f3f2ee"
        />
        <rect
          :x="item.x - barWidth / 2"
          :y="barY(item.count)"
          :width="barWidth"
          :height="barHeight(item.count)"
          fill="#dc5f0c"
          fill-opacity="0.13"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <text :x="item.x" y="138" text-anchor="middle" class="bar-val">
          {{ item.count }}
        </text>
        <text
          :x="item.x"
          :y="chartBottom + 26"
          text-anchor="middle"
          class="bar-name"
        >
          {{ item.name }}
        </text>
      </g>

      <!-- Baseline -->
      <line
        x1="14"
        :y1="chartBottom"
        x2="282"
        :y2="chartBottom"
        stroke="#1d1b18"
        stroke-width="1.8"
      />
    </svg>
    <div class="ready-row">
      <span class="ready-label">就绪</span>
      <span><code>api</code> 3/3</span>
      <span class="ready-sep" aria-hidden="true">·</span>
      <span><code>web</code> 2/2</span>
      <span class="ready-sep" aria-hidden="true">·</span>
      <span><code>postgres</code> 1/1</span>
    </div>
  </div>
</template>

<style scoped>
.replica-panel {
  display: flex;
  flex-direction: column;
  width: 348px;
}

.panel-title {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.replica-panel svg {
  display: block;
  width: 348px;
  height: 224px;
}

.ref-label {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 400;
}

.bar-val {
  fill: #1d1b18;
  font-family: "JetBrains Mono", monospace;
  font-size: 24px;
  font-weight: 700;
}

.bar-name {
  fill: #1d1b18;
  font-family: "JetBrains Mono", monospace;
  font-size: 16px;
  font-weight: 400;
}

.ready-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(29, 27, 24, 0.22);
  color: var(--ink);
  font-size: 16px;
  line-height: 1.4;
  white-space: nowrap;
}

.ready-label {
  color: var(--ink);
  font-weight: 700;
}

.ready-sep {
  color: var(--ink-2);
}

.ready-row code {
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}
</style>
