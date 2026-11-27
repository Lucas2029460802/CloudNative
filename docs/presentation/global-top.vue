<script setup lang="ts">
import { useNav } from "@slidev/client"
import { computed } from "vue"

const { currentPage, total, currentLayout, currentFrontmatter, slides } =
  useNav()

const hiddenLayouts = ["cover", "divider"]

const show = computed<boolean>(
  () =>
    !hiddenLayouts.includes(currentLayout.value) &&
    currentFrontmatter.value?.pageNumber !== false
)

const backupCount = computed<number>(
  () =>
    slides.value.filter((s) => Boolean(s.meta?.slide?.frontmatter?.backup))
      .length
)

const label = computed<string>(() =>
  currentFrontmatter.value?.backup
    ? `B${currentPage.value - (total.value - backupCount.value)}`
    : String(currentPage.value)
)
</script>

<template>
  <div
    v-if="show"
    class="slide-folio"
    data-check-allow="t2-margins,rule8-chars"
    aria-hidden="true"
  >
    {{ label }}
  </div>
</template>

<style scoped>
.slide-folio {
  position: absolute;
  right: 64px;
  bottom: 14px;
  z-index: 20;
  pointer-events: none;
  user-select: none;
  font:
    400 16px/1 "Noto Sans SC",
    sans-serif;
  font-variant-numeric: tabular-nums;
  color: #666159;
}
</style>
