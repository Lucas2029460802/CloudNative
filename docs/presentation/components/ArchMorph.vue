<script setup lang="ts">
// One clip per click; each clip starts on the previous clip's last frame,
// so swapping videos is seamless. Print/export shows each clip's last frame.
// Imported (not served from public/) so the single-file build can inline them.
const clipUrls = import.meta.glob<string>("../assets/morph/clip-*.mp4", {
  eager: true,
  import: "default",
  query: "?url",
})
const stillUrls = import.meta.glob<string>("../assets/morph/still-*.png", {
  eager: true,
  import: "default",
  query: "?url",
})
const clip = (k: number) => clipUrls[`../assets/morph/clip-${k}.mp4`]
const still = (k: number) => stillUrls[`../assets/morph/still-${k}.png`]
const later = [1, 2, 3, 4]
</script>

<template>
  <div class="morph" data-full-bleed>
    <SlidevVideo
      v-click.hide="1"
      autoplay
      print-timestamp="last"
      :poster="still(0)"
      class="clip"
    >
      <source :src="clip(0)" type="video/mp4" />
    </SlidevVideo>
    <SlidevVideo
      v-for="k in later"
      :key="k"
      v-click="[k, k + 1]"
      autoplay
      print-timestamp="last"
      :poster="still(k)"
      class="clip"
    >
      <source :src="clip(k)" type="video/mp4" />
    </SlidevVideo>
  </div>
</template>

<style scoped>
.morph {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.clip {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
