<template>
  <div class="sts-diagram caption">
    <svg
      viewBox="0 0 852 292"
      width="852"
      height="292"
      role="img"
      aria-label="删除数据库 Pod postgres-0 后，StatefulSet 重建同名 Pod 并自动重新挂载同一个 1 GiB 持久卷，4 条预约记录完好无损"
    >
      <defs>
        <marker
          id="sts-arrow-muted"
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
          id="sts-arrow-orange"
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

      <!-- Old Pod: postgres-0 -->
      <g>
        <rect
          x="10"
          y="10"
          width="236"
          height="124"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2.2"
        />
        <text x="32" y="46" class="svg-title">postgres-0</text>
        <text x="32" y="80" class="svg-mono">IP 10.244.0.26</text>
        <text x="32" y="114" class="svg-strong">预约记录：4 条</text>
      </g>

      <!-- Action arrow: kubectl delete pod postgres-0 -->
      <path
        d="M 262 72 L 590 72"
        fill="none"
        stroke="#dc5f0c"
        stroke-width="2.4"
        stroke-dasharray="7 5"
        marker-end="url(#sts-arrow-orange)"
      />
      <text x="426" y="54" text-anchor="middle" class="svg-cmd">
        kubectl delete pod postgres-0
      </text>
      <text x="426" y="102" text-anchor="middle" class="svg-sub">
        StatefulSet 重建同名 Pod
      </text>

      <!-- New Pod: postgres-0 recreated -->
      <g>
        <rect
          x="606"
          y="10"
          width="236"
          height="124"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2.2"
        />
        <text x="628" y="46" class="svg-title">postgres-0</text>
        <text x="628" y="80" class="svg-mono-bold">新 IP 10.244.0.30</text>
        <text x="628" y="114" class="svg-strong">预约记录：4 条</text>
      </g>

      <!-- Vertical mount arrows to the same PVC -->
      <path
        d="M 128 136 L 128 190"
        fill="none"
        stroke="#4b4741"
        stroke-width="2"
        stroke-dasharray="5 4"
        marker-end="url(#sts-arrow-muted)"
      />
      <text x="144" y="170" text-anchor="start" class="svg-sub">
        删除前挂载
      </text>

      <path
        d="M 724 136 L 724 190"
        fill="none"
        stroke="#dc5f0c"
        stroke-width="2.4"
        marker-end="url(#sts-arrow-orange)"
      />
      <text x="708" y="170" text-anchor="end" class="svg-strong">
        重建后自动重新挂载
      </text>

      <!-- Shared PVC: data-postgres-0 (Kubernetes addition -> orange) -->
      <g>
        <rect
          x="10"
          y="198"
          width="832"
          height="84"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <rect
          x="14"
          y="202"
          width="824"
          height="76"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="0.9"
          stroke-opacity="0.45"
        />
        <text x="426" y="234" text-anchor="middle" class="svg-pvc-title">
          同一个 PVC data-postgres-0（1 GiB 持久卷）
        </text>
        <text x="426" y="264" text-anchor="middle" class="svg-sub">
          数据独立于 Pod 保存，不随容器销毁丢失
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.sts-diagram {
  margin: 8px 0 22px;
}

.sts-diagram svg {
  display: block;
  width: 100%;
  height: auto;
}

.svg-title {
  fill: #1d1b18;
  font-family: "JetBrains Mono", monospace;
  font-size: 22px;
  font-weight: 700;
}

.svg-pvc-title {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 20px;
  font-weight: 700;
}

.svg-strong {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 18px;
  font-weight: 700;
}

.svg-sub {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 17px;
  font-weight: 400;
}

.svg-cmd {
  fill: #1d1b18;
  font-family: "JetBrains Mono", monospace;
  font-size: 16px;
  font-weight: 700;
}

.svg-mono {
  fill: #4b4741;
  font-family: "JetBrains Mono", monospace;
  font-size: 17px;
  font-weight: 400;
}

.svg-mono-bold {
  fill: #1d1b18;
  font-family: "JetBrains Mono", monospace;
  font-size: 17px;
  font-weight: 700;
}
</style>
