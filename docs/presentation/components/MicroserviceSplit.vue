<template>
  <div class="ms-split caption">
    <svg
      viewBox="0 0 852 316"
      width="852"
      height="316"
      role="img"
      aria-label="单体后端三副本按业务能力拆分为场地服务、预约服务和报告服务，各有独立数据库，由 API 网关按路径转发"
    >
      <defs>
        <marker
          id="ms-arrow-ink"
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
          id="ms-arrow-orange"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 1 1 L 9 5 L 1 9 Z" fill="#dc5f0c" />
        </marker>
      </defs>

      <!-- Section captions -->
      <text x="122" y="20" text-anchor="middle" class="sec-label">
        现状：同一后端跑 3 个副本
      </text>
      <text x="616" y="20" text-anchor="middle" class="sec-label">
        设想：按业务拆成 3 个服务
      </text>

      <!-- LEFT: Monolith -->
      <g>
        <!-- nginx -->
        <path
          d="M 46 38 L 198 37 L 197 80 L 45 81 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="122" y="65" text-anchor="middle" class="box-title">nginx</text>

        <path
          d="M 122 81 L 122 108"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#ms-arrow-ink)"
        />

        <!-- Subtle stacked replica outline (3 replicas) -->
        <path
          d="M 16 112 L 244 112 L 244 196"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.3"
          stroke-opacity="0.34"
        />
        <path
          d="M 11 117 L 239 117 L 239 201"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.3"
          stroke-opacity="0.52"
        />

        <!-- Monolith backend box with clean lower module band -->
        <path
          d="M 6 122 L 234 121 L 233 206 L 5 207 Z"
          fill="#f3f2ee"
          stroke="#1d1b18"
          stroke-width="2.2"
        />
        <text x="120" y="152" text-anchor="middle" class="box-title">
          单体后端（3 副本）
        </text>
        <line
          x1="14"
          y1="164"
          x2="226"
          y2="164"
          stroke="#1d1b18"
          stroke-width="1"
          stroke-opacity="0.2"
        />
        <text x="46" y="191" text-anchor="middle" class="box-sub">场地</text>
        <text x="120" y="191" text-anchor="middle" class="box-sub">预约</text>
        <text x="194" y="191" text-anchor="middle" class="box-sub">报告</text>
        <line
          x1="83"
          y1="169"
          x2="83"
          y2="201"
          stroke="#dc5f0c"
          stroke-width="1.8"
          stroke-dasharray="4 4"
        />
        <line
          x1="157"
          y1="169"
          x2="157"
          y2="201"
          stroke="#dc5f0c"
          stroke-width="1.8"
          stroke-dasharray="4 4"
        />

        <path
          d="M 122 207 L 122 232"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#ms-arrow-ink)"
        />

        <!-- Single DB cylinder -->
        <ellipse
          cx="122"
          cy="248"
          rx="68"
          ry="11"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <path
          d="M 54 248 L 54 290 A 68 11 0 0 0 190 290 L 190 248"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="122" y="282" text-anchor="middle" class="box-sub-ink">
          单一数据库
        </text>
      </g>

      <!-- CENTER: Transition arrow -->
      <g>
        <path
          d="M 264 162 Q 312 159, 360 162"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.6"
          stroke-linecap="round"
          marker-end="url(#ms-arrow-orange)"
        />
        <text x="312" y="144" text-anchor="middle" class="trans-label">
          按业务拆分
        </text>
      </g>

      <!-- RIGHT: API Gateway + 3 Services + 3 DBs -->
      <g>
        <!-- API Gateway -->
        <path
          d="M 516 37 L 716 38 L 715 81 L 515 80 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2.2"
        />
        <text x="616" y="65" text-anchor="middle" class="box-title">
          API 网关（nginx）
        </text>

        <!-- Fan-out arrows -->
        <path
          d="M 564 81 L 564 98 L 456 98 L 456 116"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#ms-arrow-ink)"
        />
        <path
          d="M 616 81 L 616 116"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#ms-arrow-ink)"
        />
        <path
          d="M 668 81 L 668 98 L 776 98 L 776 116"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#ms-arrow-ink)"
        />

        <!-- Service 1: 场地服务 -->
        <path
          d="M 386 122 L 526 121 L 525 199 L 385 200 Z"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <text x="456" y="154" text-anchor="middle" class="box-title">
          场地服务
        </text>
        <text x="456" y="182" text-anchor="middle" class="box-sub">
          低频 · 1–2 副本
        </text>
        <path
          d="M 456 200 L 456 232"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.8"
          marker-end="url(#ms-arrow-ink)"
        />
        <ellipse
          cx="456"
          cy="248"
          rx="52"
          ry="10"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <path
          d="M 404 248 L 404 290 A 52 10 0 0 0 508 290 L 508 248"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <text x="456" y="281" text-anchor="middle" class="box-sub-ink">
          场地库
        </text>

        <!-- Service 2: 预约服务 -->
        <path
          d="M 546 121 L 686 122 L 685 200 L 545 199 Z"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <text x="616" y="154" text-anchor="middle" class="box-title">
          预约服务
        </text>
        <text x="616" y="182" text-anchor="middle" class="box-sub">
          高频 · 独立扩容
        </text>
        <path
          d="M 616 200 L 616 232"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.8"
          marker-end="url(#ms-arrow-ink)"
        />
        <ellipse
          cx="616"
          cy="248"
          rx="52"
          ry="10"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <path
          d="M 564 248 L 564 290 A 52 10 0 0 0 668 290 L 668 248"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <text x="616" y="281" text-anchor="middle" class="box-sub-ink">
          预约库
        </text>

        <!-- Service 3: 报告服务 -->
        <path
          d="M 706 122 L 846 121 L 845 199 L 705 200 Z"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
        />
        <text x="776" y="154" text-anchor="middle" class="box-title">
          报告服务
        </text>
        <text x="776" y="182" text-anchor="middle" class="box-sub">
          异步 · 沿用 Job
        </text>
        <path
          d="M 776 200 L 776 232"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.8"
          marker-end="url(#ms-arrow-ink)"
        />
        <ellipse
          cx="776"
          cy="248"
          rx="52"
          ry="10"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <path
          d="M 724 248 L 724 290 A 52 10 0 0 0 828 290 L 828 248"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
        />
        <text x="776" y="281" text-anchor="middle" class="box-sub-ink">
          报告库
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.ms-split {
  margin-bottom: 14px;
}

.ms-split svg {
  display: block;
  width: 100%;
  height: auto;
}

.sec-label {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 700;
}

.box-title {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 19px;
  font-weight: 700;
}

.box-sub {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 400;
}

.box-sub-ink {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 700;
}

.trans-label {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 700;
}
</style>
