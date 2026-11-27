<template>
  <div class="slidev-layout cover">
    <slot />
  </div>
</template>

<style scoped>
.cover {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.slidev-layout.cover :deep(h1) {
  margin-bottom: 20px;
  font-size: 46px;
}

.slidev-layout.cover :deep(p) {
  margin: 0;
  color: var(--ink-2);
}

.slidev-layout.cover :deep(.meta) {
  margin-top: 64px;
  font-size: 18px;
  line-height: 1.7;
}

.slidev-layout.cover :deep(.cat) {
  position: absolute;
  right: 72px;
  bottom: 56px;
  width: 150px;
}
</style>
