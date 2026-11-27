<template>
  <div class="slidev-layout default">
    <slot />
  </div>
</template>

<style scoped>
.default {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.default :deep(p),
.default :deep(li) {
  position: relative;
  max-width: 29em;
  text-align: left;
}

.default :deep(ul) {
  margin: 0;
  padding-left: 1.2em;
}

.default :deep(li) {
  margin-bottom: 10px;
}

.default :deep(li:last-child) {
  margin-bottom: 0;
}

.default :deep(table) {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  border-radius: 0;
  font-size: 16px;
  line-height: 1.45;
  text-align: left;
}

.default :deep(th),
.default :deep(td) {
  padding: 10px 18px 10px 0;
  border: none;
  border-bottom: 1px solid rgba(29, 27, 24, 0.22);
  border-radius: 0;
  color: var(--ink);
  font-size: 16px;
  vertical-align: top;
}

.default :deep(th:last-child),
.default :deep(td:last-child) {
  padding-right: 0;
}

.default :deep(th) {
  border-bottom: 1px solid var(--ink);
  font-weight: 700;
}

.default :deep(tr:last-child td) {
  border-bottom: 1px solid rgba(29, 27, 24, 0.35);
}

.default :deep(code) {
  padding: 0 3px;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  font-weight: 400;
}

.default :deep(td code),
.default :deep(th code),
.default :deep(.caption code) {
  font-size: 16px;
}

.default :deep(pre),
.default :deep(.slidev-code-wrapper),
.default :deep(.shiki),
.default :deep(.shiki-magic-move-container) {
  margin: 0;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.default :deep(pre),
.default :deep(.shiki-magic-move-container) {
  padding: 12px 16px !important;
  border: 1px solid rgba(29, 27, 24, 0.24) !important;
  background: #f9f8f5 !important;
  color: var(--ink);
  font-family: "JetBrains Mono", monospace !important;
  font-size: 18px !important;
  line-height: 1.5 !important;
  overflow-x: hidden;
}

.default :deep(pre code),
.default :deep(.shiki-magic-move-container code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 18px !important;
  line-height: 1.5 !important;
}

/* Keep Shiki syntax colors visible while darkening them for >= 4.5:1 contrast on light paper. */
.default :deep(.shiki span),
.default :deep(.shiki-magic-move-container span) {
  color: color-mix(in srgb, var(--shiki-light, var(--ink)) 62%, var(--ink));
}

.default :deep(.cols) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
}

.default :deep(.col-grow) {
  flex: 1 1 0;
  min-width: 0;
}

.default :deep(.caption) {
  color: var(--ink-2);
  font-size: 16px;
  line-height: 1.5;
}
</style>
