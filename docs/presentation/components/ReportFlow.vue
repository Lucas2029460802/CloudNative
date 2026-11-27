<template>
  <div class="report-flow caption">
    <svg
      viewBox="0 0 852 222"
      width="852"
      height="222"
      role="img"
      aria-label="CronJob 定时触发与页面手动触发共用同一份模板创建报告 Job，报告状态经等待、执行中流向已完成或失败"
    >
      <defs>
        <marker
          id="rf-arrow-ink"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 1 1 L 9 5 L 1 9 Z" fill="#1d1b18" />
        </marker>
        <marker
          id="rf-arrow-muted"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 1 1 L 9 5 L 1 9 Z" fill="#4b4741" />
        </marker>
        <marker
          id="rf-arrow-orange"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 1 1 L 9 5 L 1 9 Z" fill="#dc5f0c" />
        </marker>
      </defs>

      <!-- Trigger 1: CronJob (Kubernetes addition -> orange) -->
      <g>
        <rect
          x="2"
          y="20"
          width="206"
          height="78"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <rect
          x="5"
          y="23"
          width="200"
          height="72"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="0.9"
          stroke-opacity="0.45"
        />
        <text x="105" y="53" text-anchor="middle" class="rf-title">
          CronJob 定时
        </text>
        <text x="105" y="81" text-anchor="middle" class="rf-sub">
          每 2 分钟，不重叠
        </text>
      </g>

      <!-- Trigger 2: Manual trigger -->
      <g>
        <rect
          x="2"
          y="126"
          width="206"
          height="78"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2.2"
        />
        <text x="105" y="159" text-anchor="middle" class="rf-title">
          手动触发
        </text>
        <text x="105" y="187" text-anchor="middle" class="rf-sub">
          页面点击生成
        </text>
      </g>

      <!-- Merge arrows into Job -->
      <path
        d="M 208 59 L 246 59 L 246 98 L 282 98"
        fill="none"
        stroke="#dc5f0c"
        stroke-width="2.2"
        marker-end="url(#rf-arrow-orange)"
      />
      <path
        d="M 208 165 L 246 165 L 246 126 L 282 126"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
        marker-end="url(#rf-arrow-ink)"
      />

      <!-- Shared Job (Kubernetes addition -> orange) -->
      <g>
        <rect
          x="288"
          y="54"
          width="206"
          height="116"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <rect
          x="291"
          y="57"
          width="200"
          height="110"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="0.9"
          stroke-opacity="0.45"
        />
        <text x="391" y="90" text-anchor="middle" class="rf-title">
          报告 Job
        </text>
        <text x="391" y="119" text-anchor="middle" class="rf-sub">
          共用同一份模板
        </text>
        <text x="391" y="147" text-anchor="middle" class="rf-sub">
          统计完即退出
        </text>
      </g>

      <!-- Arrow: Job -> 等待 -->
      <path
        d="M 494 112 L 530 112 L 530 61 L 558 61"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
        marker-end="url(#rf-arrow-ink)"
      />

      <!-- State group heading -->
      <text x="564" y="24" class="rf-group">报告状态</text>

      <!-- State flow: 等待 -> 执行中 -> 已完成 / 失败 -->
      <rect
        x="564"
        y="38"
        width="108"
        height="46"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
      />
      <text x="618" y="67" text-anchor="middle" class="rf-state">等待</text>

      <path
        d="M 672 61 L 724 61"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
        marker-end="url(#rf-arrow-ink)"
      />

      <rect
        x="730"
        y="38"
        width="116"
        height="46"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
      />
      <text x="788" y="67" text-anchor="middle" class="rf-state">执行中</text>

      <!-- Separate branches from 执行中 (no shared stem) -->
      <path
        d="M 762 84 L 762 109 L 618 109 L 618 132"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2"
        marker-end="url(#rf-arrow-ink)"
      />
      <path
        d="M 812 84 L 812 132"
        fill="none"
        stroke="#4b4741"
        stroke-width="2"
        stroke-dasharray="5 4"
        marker-end="url(#rf-arrow-muted)"
      />

      <rect
        x="564"
        y="138"
        width="108"
        height="46"
        fill="none"
        stroke="#1d1b18"
        stroke-width="2.2"
      />
      <text x="618" y="167" text-anchor="middle" class="rf-state">已完成</text>
      <text x="618" y="210" text-anchor="middle" class="rf-sub">写入结果</text>

      <rect
        x="730"
        y="138"
        width="116"
        height="46"
        fill="none"
        stroke="#4b4741"
        stroke-width="2"
        stroke-dasharray="5 4"
      />
      <text x="788" y="167" text-anchor="middle" class="rf-state">失败</text>
      <text x="788" y="210" text-anchor="middle" class="rf-sub">
        查询时核对
      </text>
    </svg>
  </div>
</template>

<style scoped>
.report-flow {
  margin-bottom: 22px;
}

.report-flow svg {
  display: block;
  width: 100%;
  height: auto;
}

.rf-title {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 19px;
  font-weight: 700;
}

.rf-group {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 700;
}

.rf-state {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 17px;
  font-weight: 700;
}

.rf-sub {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 400;
}
</style>
