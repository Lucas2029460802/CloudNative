<script setup lang="ts">
import {
  siBun,
  siDocker,
  siDrizzle,
  siHono,
  siKubernetes,
  siNginx,
  siNodedotjs,
  siPostgresql,
  siReact,
  siTailwindcss,
  siTanstack,
  siVite,
  siZod,
} from "simple-icons"

type TechItem = {
  label: string
  path?: string
}

type TechGroup = {
  name: string
  items: TechItem[]
}

const rows: TechGroup[][] = [
  [
    {
      name: "前端",
      items: [
        { label: "React", path: siReact.path },
        { label: "TanStack", path: siTanstack.path },
        { label: "Tailwind", path: siTailwindcss.path },
        { label: "Vite", path: siVite.path },
      ],
    },
    {
      name: "接口",
      items: [{ label: "oRPC" }, { label: "Zod", path: siZod.path }],
    },
    {
      name: "后端",
      items: [
        { label: "Hono", path: siHono.path },
        { label: "Node.js", path: siNodedotjs.path },
      ],
    },
  ],
  [
    {
      name: "数据",
      items: [
        { label: "Drizzle", path: siDrizzle.path },
        { label: "PostgreSQL", path: siPostgresql.path },
      ],
    },
    {
      name: "工具",
      items: [{ label: "Bun", path: siBun.path }],
    },
    {
      name: "部署",
      items: [
        { label: "nginx", path: siNginx.path },
        { label: "Docker", path: siDocker.path },
        { label: "Kubernetes", path: siKubernetes.path },
      ],
    },
  ],
]
</script>

<template>
  <div class="tech-strip caption" aria-label="技术栈">
    <div v-for="(row, rowIdx) in rows" :key="rowIdx" class="tech-row">
      <div v-for="group in row" :key="group.name" class="tech-group">
        <span class="group-name">{{ group.name }}</span>
        <span v-for="item in group.items" :key="item.label" class="tech-item">
          <svg
            v-if="item.path"
            class="tech-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path :d="item.path" />
          </svg>
          <span class="tech-label" :class="{ 'is-text-only': !item.path }">
            {{ item.label }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tech-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(29, 27, 24, 0.22);
}

.tech-row {
  display: grid;
  grid-template-columns: 348px 132px 1fr;
  align-items: center;
  column-gap: 16px;
}

.tech-group {
  display: flex;
  align-items: center;
  gap: 7px;
}

.group-name {
  margin-right: 2px;
  color: var(--ink-2);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.tech-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink);
  font-size: 16px;
  line-height: 1.25;
  white-space: nowrap;
}

.tech-icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  fill: var(--ink);
}

.tech-label {
  color: var(--ink);
  font-size: 16px;
  font-weight: 400;
}

.tech-label.is-text-only {
  font-family: "JetBrains Mono", monospace;
  font-weight: 400;
}
</style>
