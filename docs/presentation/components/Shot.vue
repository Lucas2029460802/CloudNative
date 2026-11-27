<script setup lang="ts">
import { computed } from "vue"
import demo01 from "../../report-assets/demo-01-selected.png?inline"
import demo02 from "../../report-assets/demo-02-confirmed.png?inline"
import demo03 from "../../report-assets/demo-03-conflict.png?inline"
import demo04 from "../../report-assets/demo-04-cancelled.png?inline"
import demo05 from "../../report-assets/demo-05-reservations.png?inline"
import lab2Reports from "../../report-assets/lab2-01-reports-zh.png?inline"
import lab2Board from "../../report-assets/lab2-03-board-zh.png?inline"

const bundledAssets: Record<string, string> = {
  "demo-01-selected": demo01,
  "demo-02-confirmed": demo02,
  "demo-03-conflict": demo03,
  "demo-04-cancelled": demo04,
  "demo-05-reservations": demo05,
  "lab2-01-reports-zh": lab2Reports,
  "lab2-03-board-zh": lab2Board,
}

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    tilt?: number
    caption?: string
    maxHeight?: string
    maxWidth?: string
    zoom?: number
    posX?: number
    posY?: number
    frameWidth?: string
    frameHeight?: string
  }>(),
  {
    src: "",
    alt: "",
    tilt: 0,
    caption: "",
    maxHeight: "340px",
    maxWidth: "100%",
    zoom: 0,
    posX: 50,
    posY: 50,
    frameWidth: "100%",
    frameHeight: "320px",
  }
)

const resolvedSrc = computed(() => bundledAssets[props.src] ?? props.src)
const isCropped = computed(() => Boolean(resolvedSrc.value) && props.zoom > 0)

const cropStyle = computed(() => ({
  width: props.frameWidth,
  height: props.frameHeight,
  backgroundImage: `url("${resolvedSrc.value}")`,
  backgroundSize: `${props.zoom}% auto`,
  backgroundPosition: `${props.posX}% ${props.posY}%`,
}))
</script>

<template>
  <figure
    class="shot"
    :style="{
      '--shot-tilt': `${tilt}deg`,
      '--shot-max-h': maxHeight,
      '--shot-max-w': maxWidth,
    }"
  >
    <div class="shot-stage" :class="{ 'is-tilted': tilt !== 0 }">
      <div
        v-if="isCropped"
        class="shot-crop"
        role="img"
        :aria-label="alt"
        :style="cropStyle"
      />
      <img v-else-if="resolvedSrc" :src="resolvedSrc" :alt="alt" />
      <slot v-else />
    </div>
    <figcaption v-if="caption" class="caption shot-caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.shot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 0;
}

.shot-stage {
  padding: 0;
}

.shot-stage.is-tilted {
  padding: 8px 10px;
}

.shot-crop {
  border: 1.5px solid #1d1b18;
  border-radius: 0;
  background-color: #ffffff;
  background-repeat: no-repeat;
  box-shadow: none;
  transform: rotate(var(--shot-tilt));
  transform-origin: center center;
}

.shot-stage :deep(img),
.shot-stage img {
  display: block;
  max-width: var(--shot-max-w);
  max-height: var(--shot-max-h);
  width: auto;
  height: auto;
  border: 1.5px solid #1d1b18;
  border-radius: 0;
  box-shadow: none;
  object-fit: contain;
  transform: rotate(var(--shot-tilt));
  transform-origin: center center;
}

.shot-caption {
  margin-top: 10px;
  max-width: 30em;
  color: var(--ink-2);
  font-size: 16px;
  line-height: 1.5;
  text-align: left;
}
</style>
