<script setup lang="ts">
const scenes = ["1. 预约成功", "2. 冲突拒绝", "3. 取消后重新预约"]
</script>

<template>
  <ul class="demo-cues">
    <li v-for="scene in scenes" :key="scene">{{ scene }}</li>
  </ul>
</template>

<style scoped>
.demo-cues {
  position: absolute;
  right: 64px;
  bottom: 84px;
  left: 64px;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 40px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-cues li {
  color: var(--ink);
  font-family: "Noto Sans SC", sans-serif;
  font-size: 22px;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  white-space: nowrap;
}
</style>
