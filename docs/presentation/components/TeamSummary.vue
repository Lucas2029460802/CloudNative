<script setup lang="ts">
type Member = {
  role: string
  tech?: string
  name: string
  detail: string
  strokePath: string
  strokePath2: string
  strokeWidth: number
}

const members: Member[] = [
  {
    role: "后端",
    tech: "Hono 与 Node.js",
    name: "彭知书",
    detail: "接口规则与报告任务调度",
    strokePath: "M 3 11 Q 34 4, 70 9.5",
    strokePath2: "M 6 14 Q 40 9, 67 12",
    strokeWidth: 74,
  },
  {
    role: "前端",
    tech: "React 与 TanStack",
    name: "黄泓力",
    detail: "预约与报告页面、端到端测试",
    strokePath: "M 3 10 Q 38 14, 70 7.5",
    strokePath2: "M 7 13.5 Q 36 7, 66 11",
    strokeWidth: 74,
  },
  {
    role: "部署与运维",
    tech: "Docker 与 Kubernetes",
    name: "郑皓名",
    detail: "数据库、镜像与集群清单",
    strokePath: "M 4 11 Q 82 4, 170 10",
    strokePath2: "M 8 14 Q 94 9, 165 12.5",
    strokeWidth: 174,
  },
]
</script>

<template>
  <div class="team-cols caption" aria-label="成员分工">
    <div v-for="m in members" :key="m.name" class="team-col">
      <div class="role-head">
        <div class="role-wrap">
          <span class="role-text">{{ m.role }}</span>
          <svg
            class="role-mark"
            :viewBox="`0 0 ${m.strokeWidth} 18`"
            :width="m.strokeWidth"
            height="18"
            fill="none"
            aria-hidden="true"
          >
            <path
              :d="m.strokePath"
              stroke="#dc5f0c"
              stroke-width="3.2"
              stroke-linecap="round"
            />
            <path
              :d="m.strokePath2"
              stroke="#dc5f0c"
              stroke-width="1.4"
              stroke-linecap="round"
              opacity="0.55"
            />
          </svg>
        </div>
        <div v-if="m.tech" class="role-tech">{{ m.tech }}</div>
      </div>
      <div class="member-name">{{ m.name }}</div>
      <div class="member-detail">{{ m.detail }}</div>
    </div>
  </div>
</template>

<style scoped>
.team-cols {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-content: center;
  align-items: flex-start;
  justify-content: space-between;
  gap: 44px;
  width: 100%;
  padding-bottom: 36px;
}

.team-col {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: flex-start;
  padding-top: 22px;
  border-top: 1px solid rgba(29, 27, 24, 0.25);
}

.role-head {
  min-height: 86px;
}

.role-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
}

.role-text {
  color: var(--ink);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.role-mark {
  display: block;
  margin-top: 2px;
}

.role-tech {
  margin-top: 8px;
  color: var(--ink-2);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.35;
  white-space: nowrap;
}

.member-name {
  margin-top: 22px;
  color: var(--ink);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
}

.member-detail {
  margin-top: 10px;
  color: var(--ink);
  font-size: 18px;
  font-weight: 400;
  line-height: 1.5;
}
</style>
