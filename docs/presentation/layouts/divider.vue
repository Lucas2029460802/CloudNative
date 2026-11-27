<script setup lang="ts">
import { useNav } from "@slidev/client"
import { computed } from "vue"

defineProps<{ no: string; label: string }>()

const { slides } = useNav()

const dividerTotal = computed<string>(() =>
  String(
    slides.value.filter((s) => s.meta?.slide?.frontmatter?.layout === "divider")
      .length
  ).padStart(2, "0")
)
</script>

<template>
  <div class="slidev-layout divider">
    <div class="lockup">
      <div class="hept-wrap">
        <!-- Hand-sketched Kubernetes 7-sided heptagon (slight -4deg tilt, double-pass pen lines + subtle inward helm notches) -->
        <svg
          class="hept-svg"
          viewBox="0 0 300 300"
          fill="none"
          aria-hidden="true"
        >
          <!-- Primary organic hand-sketched heptagon with slight natural bow and top overlap -->
          <path
            d="M 134 31
                   Q 192 45, 241 67
                   Q 257 117, 270 169
                   Q 242 214, 210 256
                   Q 157 262, 105 263
                   Q 67 225, 34 185
                   Q 40 132, 50 81
                   Q 95 52, 149 26"
            stroke="var(--orange)"
            stroke-width="2.15"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.90"
          />

          <!-- Secondary faint sketching pass with slight architectural vertex jitter -->
          <path
            d="M 145 27
                   Q 196 47, 244 72
                   Q 259 120, 267 173
                   Q 237 216, 206 254
                   Q 154 259, 101 260
                   Q 65 221, 37 181
                   Q 44 130, 54 78
                   Q 99 50, 141 29"
            stroke="var(--orange)"
            stroke-width="1.05"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.40"
          />

          <!-- Subtle hand-drawn inward helm notches at the 7 Kubernetes vertices -->
          <path
            d="M 142 29 Q 143 37, 144 45"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 240 68 Q 233 74, 227 80"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 269 169 Q 261 168, 253 166"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 210 255 Q 206 248, 201 241"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 105 262 Q 108 255, 112 247"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 34 185 Q 42 183, 50 180"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
          <path
            d="M 50 81 Q 57 86, 64 91"
            stroke="var(--orange)"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.62"
          />
        </svg>
        <p class="no" data-check-allow="t5-weight">{{ no }}</p>
      </div>

      <div class="title-block">
        <p class="eyebrow" data-check-allow="t5-weight">
          {{ no }} / {{ dividerTotal }}
        </p>
        <h1>{{ label }}</h1>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.divider {
  --ink-muted: #726d66;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.lockup {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 54px;
  transform: translate(-4px, -6px);
}

.hept-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 288px;
  height: 288px;
  flex-shrink: 0;
  transform: translateY(-10px);
}

.hept-svg {
  position: absolute;
  inset: 0;
  width: 288px;
  height: 288px;
  overflow: visible;
  pointer-events: none;
}

.divider .no {
  position: relative;
  z-index: 1;
  margin: 0;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 118px;
  font-weight: 200;
  line-height: 1;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
  transform: translate(1px, 3px);
}

.title-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transform: translateY(22px);
}

.divider .eyebrow {
  margin: 0 0 14px;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.16em;
}

.divider h1 {
  margin: 0;
  font-family: "Noto Sans SC", sans-serif;
  font-size: 76px;
  font-weight: 700;
  line-height: 1.08;
  color: var(--ink);
  letter-spacing: 0.14em;
}
</style>
