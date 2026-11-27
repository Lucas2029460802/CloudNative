<template>
  <div class="ms-changes caption">
    <svg
      viewBox="0 0 852 328"
      width="852"
      height="328"
      role="img"
      aria-label="拆库后的三处改动：预约查询场地改为同步调用或事件异步同步、取消跨库外键改由预约服务校验场地是否存在、报告统计分别调用两方接口汇总"
    >
      <defs>
        <marker
          id="mc-arrow-ink"
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
          id="mc-arrow-orange"
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

      <!-- Row 1: 预约查询场地 -->
      <g>
        <text x="0" y="58" class="row-tag">1. 查询场地</text>

        <path
          d="M 136 26 L 244 25 L 243 78 L 135 79 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="190" y="58" text-anchor="middle" class="node-text">
          预约服务
        </text>

        <!-- Option A: Solid sync arrow -->
        <path
          d="M 252 40 L 408 40"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
          marker-end="url(#mc-arrow-ink)"
        />
        <text x="330" y="28" text-anchor="middle" class="edge-text">
          方案 A：同步查询
        </text>

        <!-- Option B: Dashed async event arrow -->
        <path
          d="M 414 66 L 258 66"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2"
          stroke-dasharray="6 4"
          marker-end="url(#mc-arrow-orange)"
        />
        <text x="336" y="90" text-anchor="middle" class="edge-text">
          方案 B：事件同步
        </text>

        <path
          d="M 422 25 L 530 26 L 529 79 L 421 78 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="476" y="58" text-anchor="middle" class="node-text">
          场地服务
        </text>

        <text x="556" y="58" class="note-text">场地信息允许延迟同步</text>
      </g>

      <line
        x1="0"
        y1="108"
        x2="852"
        y2="108"
        stroke="#1d1b18"
        stroke-opacity="0.16"
        stroke-width="1"
      />

      <!-- Row 2: 取消跨库外键 -->
      <g>
        <text x="0" y="168" class="row-tag">2. 取消外键</text>

        <path
          d="M 136 136 L 244 135 L 243 188 L 135 189 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="190" y="168" text-anchor="middle" class="node-text">
          预约库
        </text>

        <line
          x1="252"
          y1="162"
          x2="412"
          y2="162"
          stroke="#4b4741"
          stroke-width="2"
          stroke-dasharray="5 5"
        />
        <!-- Hand-drawn orange X -->
        <path
          d="M 322 150 L 344 174 M 344 150 L 322 174"
          stroke="#dc5f0c"
          stroke-width="2.6"
          stroke-linecap="round"
        />

        <path
          d="M 422 135 L 530 136 L 529 189 L 421 188 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="476" y="168" text-anchor="middle" class="node-text">
          场地库
        </text>

        <text x="556" y="168" class="note-text">
          改由预约服务校验场地是否存在
        </text>
      </g>

      <line
        x1="0"
        y1="216"
        x2="852"
        y2="216"
        stroke="#1d1b18"
        stroke-opacity="0.16"
        stroke-width="1"
      />

      <!-- Row 3: 利用率报告统计 -->
      <g>
        <text x="0" y="280" class="row-tag">3. 报告汇总</text>

        <path
          d="M 136 248 L 244 247 L 243 300 L 135 301 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="2"
        />
        <text x="190" y="280" text-anchor="middle" class="node-text">
          报告服务
        </text>

        <!-- Fork arrows to 场地 and 预约 (orange marks the API composition change) -->
        <path
          d="M 252 264 L 332 264 L 332 251 L 414 251"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
          marker-end="url(#mc-arrow-orange)"
        />
        <path
          d="M 252 284 L 332 284 L 332 298 L 414 298"
          fill="none"
          stroke="#dc5f0c"
          stroke-width="2.2"
          marker-end="url(#mc-arrow-orange)"
        />

        <path
          d="M 422 232 L 530 233 L 529 269 L 421 268 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.9"
        />
        <text x="476" y="256" text-anchor="middle" class="node-small">
          场地接口
        </text>

        <path
          d="M 422 280 L 530 281 L 529 317 L 421 316 Z"
          fill="none"
          stroke="#1d1b18"
          stroke-width="1.9"
        />
        <text x="476" y="304" text-anchor="middle" class="node-small">
          预约接口
        </text>

        <text x="556" y="280" class="note-text">分别调用两方接口汇总统计</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.ms-changes {
  margin-bottom: 12px;
}

.ms-changes svg {
  display: block;
  width: 100%;
  height: auto;
}

.row-tag {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 18px;
  font-weight: 700;
}

.node-text {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 18px;
  font-weight: 700;
}

.node-small {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 700;
}

.edge-text {
  fill: #4b4741;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 400;
}

.note-text {
  fill: #1d1b18;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 18px;
  font-weight: 400;
}
</style>
