import { Composition } from "remotion"
import { Morph } from "./Morph"

export function Root() {
  return (
    <Composition
      id="Morph"
      component={Morph}
      durationInFrames={221}
      fps={30}
      width={1960}
      height={1104}
    />
  )
}
