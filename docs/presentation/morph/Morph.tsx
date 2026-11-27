import "@fontsource/noto-sans-sc/400.css"
import "@fontsource/noto-sans-sc/700.css"
import { useEffect, useState } from "react"
import {
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  interpolateColors,
  staticFile,
  useCurrentFrame,
} from "remotion"
import {
  FONT_SANS,
  INK,
  INK_2,
  ORANGE,
  PAPER,
  RoughArrowhead,
  RoughEdge,
  RoughRect,
} from "./sketch"

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const MOVE_EASE = Easing.bezier(0.2, 0, 0, 1)
const ENTER_EASE = Easing.bezier(0.05, 0.7, 0.1, 1)

function progress(
  frame: number,
  start: number,
  end: number,
  easing: (t: number) => number = MOVE_EASE
): number {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  })
}

function lerpBox(a: Box, b: Box, t: number): Box {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  }
}

const STATES = {
  browser: { x: 60, y: 212, w: 56, h: 68 },
  dockerBoundary: { x: 186, y: 158, w: 684, h: 256 },
  nsBoundary: { x: 142, y: 148, w: 780, h: 340 },
  frontendS0: { x: 214, y: 204, w: 158, h: 84 },
  frontendS1: { x: 250, y: 204, w: 117, h: 84 },
  apiS0: { x: 448, y: 204, w: 158, h: 84 },
  apiS1: { x: 495, y: 204, w: 117, h: 84 },
  dbS0: { x: 682, y: 204, w: 158, h: 84 },
  dbS1: { x: 794, y: 204, w: 118, h: 84 },
  volS0: { x: 682, y: 338, w: 158, h: 50 },
  volS1: { x: 794, y: 330, w: 118, h: 50 },
  envS0: { x: 448, y: 338, w: 158, h: 50 },
  envS1: { x: 475, y: 330, w: 158, h: 50 },
  cmS2: { x: 402, y: 330, w: 142, h: 50 },
  secretStart: { x: 528, y: 330, w: 104, h: 50 },
  secretS2: { x: 572, y: 330, w: 104, h: 50 },
  svcWeb: { x: 152, y: 218, w: 62, h: 56 },
  svcApi: { x: 407, y: 218, w: 52, h: 56 },
  svcPg: { x: 656, y: 218, w: 102, h: 56 },
  daemonSet: { x: 250, y: 420, w: 140, h: 52 },
  cronJob: { x: 414, y: 420, w: 130, h: 52 },
  job: { x: 580, y: 420, w: 96, h: 52 },
} as const

interface NodeLabelSpec {
  label: string
  sub?: string
  icon?: string
  opacity: number
}

interface NodeProps {
  id: string
  box: Box
  seed: number
  stroke?: string
  drawProgress?: number
  opacity?: number
  scale?: number
  ghosts?: Array<{ dx: number; dy: number; opacity: number; seed: number }>
  titleBarY?: number
  primary?: NodeLabelSpec
  secondary?: NodeLabelSpec
  variant?: "tall" | "compact" | "browser" | "service"
  belowSub?: { text: string; opacity: number; offsetX?: number }
}

function NodeContent({
  box,
  spec,
  variant,
}: {
  box: Box
  spec: NodeLabelSpec
  variant: "tall" | "compact" | "browser" | "service"
}) {
  if (spec.opacity <= 0.001) {
    return null
  }
  const hasIcon = Boolean(spec.icon)
  const iconSize = variant === "service" ? 20 : variant === "tall" ? 21 : 26

  if (variant === "browser") {
    return (
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y + 14,
          width: box.w,
          height: box.h - 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: spec.opacity,
          fontFamily: FONT_SANS,
          fontSize: 18,
          fontWeight: 700,
          color: INK,
          whiteSpace: "nowrap",
        }}
      >
        {spec.label}
      </div>
    )
  }

  if (variant === "service") {
    return (
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          boxSizing: "border-box",
          opacity: spec.opacity,
        }}
      >
        {spec.icon && (
          <Img
            src={staticFile(spec.icon)}
            style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
          />
        )}
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 18,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          {spec.label}
        </span>
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          display: "flex",
          alignItems: "center",
          justifyContent: hasIcon ? "flex-start" : "center",
          gap: 4,
          paddingLeft: hasIcon ? 7 : 6,
          paddingRight: 5,
          boxSizing: "border-box",
          opacity: spec.opacity,
        }}
      >
        {spec.icon && (
          <Img
            src={staticFile(spec.icon)}
            style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: hasIcon ? "flex-start" : "center",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 18,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {spec.label}
          </span>
          {spec.sub && (
            <span
              style={{
                fontFamily: FONT_SANS,
                fontSize: 16,
                fontWeight: 400,
                color: INK_2,
                lineHeight: 1.15,
                whiteSpace: "nowrap",
              }}
            >
              {spec.sub}
            </span>
          )}
        </div>
      </div>
    )
  }

  // tall variant (h = 84)
  if (hasIcon) {
    return (
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          padding: "7px 6px 7px 6px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 3,
          opacity: spec.opacity,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            width: "100%",
          }}
        >
          {spec.icon && (
            <Img
              src={staticFile(spec.icon)}
              style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
            />
          )}
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 18,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {spec.label}
          </span>
        </div>
        {spec.sub && (
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 16,
              fontWeight: 400,
              color: INK_2,
              lineHeight: 1.2,
              whiteSpace: "pre",
            }}
          >
            {spec.sub}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        padding: "6px 8px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
        opacity: spec.opacity,
      }}
    >
      <span
        style={{
          fontFamily: FONT_SANS,
          fontSize: 18,
          fontWeight: 700,
          color: INK,
          lineHeight: 1.15,
          whiteSpace: "nowrap",
        }}
      >
        {spec.label}
      </span>
      {spec.sub && (
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 16,
            fontWeight: 400,
            color: INK_2,
            lineHeight: 1.15,
            whiteSpace: "nowrap",
          }}
        >
          {spec.sub}
        </span>
      )}
    </div>
  )
}

function NodeSvg({
  id,
  box,
  seed,
  stroke = INK,
  drawProgress = 1,
  opacity = 1,
  scale = 1,
  ghosts,
  titleBarY,
}: Omit<NodeProps, "primary" | "secondary" | "variant" | "belowSub">) {
  if (opacity <= 0.001 || drawProgress <= 0.001) {
    return null
  }
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const scaleTransform =
    scale !== 1
      ? `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`
      : undefined

  return (
    <g transform={scaleTransform} opacity={opacity}>
      {ghosts?.map((g) => (
        <RoughRect
          key={`${id}-ghost-${g.seed}`}
          id={`${id}-ghost-${g.seed}`}
          x={box.x + g.dx}
          y={box.y + g.dy}
          w={box.w}
          h={box.h}
          seed={g.seed}
          stroke={stroke}
          opacity={g.opacity}
        />
      ))}
      <RoughRect
        id={id}
        x={box.x}
        y={box.y}
        w={box.w}
        h={box.h}
        seed={seed}
        stroke={stroke}
        drawProgress={drawProgress}
        titleBarY={titleBarY}
      />
    </g>
  )
}

function NodeOverlay({
  box,
  opacity = 1,
  scale = 1,
  primary,
  secondary,
  variant = "tall",
  belowSub,
}: Pick<
  NodeProps,
  "box" | "opacity" | "scale" | "primary" | "secondary" | "variant" | "belowSub"
>) {
  if (opacity <= 0.001) {
    return null
  }
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: `${cx}px ${cy}px`,
      }}
    >
      {primary && <NodeContent box={box} spec={primary} variant={variant} />}
      {secondary && (
        <NodeContent box={box} spec={secondary} variant={variant} />
      )}
      {belowSub && belowSub.opacity > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: box.x - 24 + (belowSub.offsetX ?? 0),
            top: box.y + box.h + 10,
            width: box.w + 48,
            textAlign: "center",
            fontFamily: FONT_SANS,
            fontSize: 16,
            fontWeight: 400,
            color: INK_2,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            opacity: belowSub.opacity,
          }}
        >
          {belowSub.text}
        </div>
      )}
    </div>
  )
}

export function Morph() {
  const frame = useCurrentFrame()
  const [fontHandle] = useState(() => delayRender("Loading Noto Sans SC"))

  useEffect(() => {
    const sample = "浏览器数据卷命名空间主机副本，"
    Promise.all([
      document.fonts.ready,
      document.fonts.load('400 16px "Noto Sans SC"', sample),
      document.fonts.load('700 18px "Noto Sans SC"', sample),
    ])
      .catch(() => undefined)
      .finally(() => {
        continueRender(fontHandle)
      })
  }, [fontHandle])

  // --- Clip 0 (0-44): S0 draw-in ---
  const dBoundary0 = progress(frame, 0, 22, ENTER_EASE)
  const dBrowser = progress(frame, 2, 22, ENTER_EASE)
  const dFrontend = progress(frame, 3, 24, ENTER_EASE)
  const dApi = progress(frame, 4, 25, ENTER_EASE)
  const dDb = progress(frame, 5, 26, ENTER_EASE)
  const dEnv = progress(frame, 6, 27, ENTER_EASE)
  const dVol = progress(frame, 7, 28, ENTER_EASE)
  const dEdge0 = progress(frame, 10, 26, ENTER_EASE)
  const dEdge1 = progress(frame, 12, 27, ENTER_EASE)
  const dEdge2 = progress(frame, 14, 28, ENTER_EASE)
  const dEdgeEnv = progress(frame, 16, 29, ENTER_EASE)
  const dEdgeVol = progress(frame, 17, 30, ENTER_EASE)
  const s0Text = progress(frame, 20, 36, ENTER_EASE)

  // --- Clip 1 (45-89): S0 -> S1 over 45-81 ---
  const dockerFadeOut = 1 - progress(frame, 45, 53, MOVE_EASE)
  const mFrontend = progress(frame, 45, 69, MOVE_EASE)
  const mApi = progress(frame, 46, 70, MOVE_EASE)
  const mDb = progress(frame, 47, 71, MOVE_EASE)
  const mVol = progress(frame, 48, 72, MOVE_EASE)
  const mEnv1 = progress(frame, 49, 73, MOVE_EASE)

  const s0LabelFadeOut = 1 - progress(frame, 47, 57, MOVE_EASE)
  const s1LabelFadeIn = progress(frame, 68, 78, ENTER_EASE)

  const ghostWebT = progress(frame, 69, 79, ENTER_EASE)
  const ghostApi1T = progress(frame, 70, 79, ENTER_EASE)
  const ghostApi2T = progress(frame, 72, 81, ENTER_EASE)

  const nsDraw = progress(frame, 66, 78, ENTER_EASE)
  const nsText = progress(frame, 72, 81, ENTER_EASE)

  // --- Clip 2 (90-128): S1 -> S2 over 90-120 ---
  const mCm = progress(frame, 90, 112, MOVE_EASE)
  const mSecret = progress(frame, 93, 114, MOVE_EASE)
  const secretOpacity = progress(frame, 93, 101, ENTER_EASE)
  const envLabelOut = 1 - progress(frame, 92, 100, MOVE_EASE)
  const cmLabelIn = progress(frame, 108, 118, ENTER_EASE)
  const secretLabelIn = progress(frame, 110, 119, ENTER_EASE)
  const dEdgeSecret = progress(frame, 106, 119, ENTER_EASE)

  // --- Clip 3 (129-173): S2 -> S3 over 129-165 ---
  const edgeLabelFade = 1 - progress(frame, 129, 139, MOVE_EASE)

  const svcWebT = progress(frame, 131, 151, ENTER_EASE)
  const svcApiT = progress(frame, 133, 153, ENTER_EASE)
  const svcPgT = progress(frame, 135, 155, ENTER_EASE)
  const svcWebText = progress(frame, 145, 157, ENTER_EASE)
  const svcApiText = progress(frame, 147, 159, ENTER_EASE)
  const svcPgText = progress(frame, 149, 161, ENTER_EASE)

  // --- Clip 4 (174-220): S3 -> S4 over 174-210 ---
  const dsT = progress(frame, 174, 194, ENTER_EASE)
  const cjT = progress(frame, 177, 197, ENTER_EASE)
  const jobT = progress(frame, 180, 200, ENTER_EASE)
  const dsText = progress(frame, 188, 200, ENTER_EASE)
  const cjText = progress(frame, 191, 203, ENTER_EASE)
  const jobText = progress(frame, 194, 206, ENTER_EASE)
  const dEdgeCjJob = progress(frame, 192, 206, ENTER_EASE)
  const dEdgeJobPg = progress(frame, 195, 209, ENTER_EASE)

  // --- Interpolated boxes ---
  const frontendBox = lerpBox(STATES.frontendS0, STATES.frontendS1, mFrontend)
  const apiBox = lerpBox(STATES.apiS0, STATES.apiS1, mApi)
  const dbBox = lerpBox(STATES.dbS0, STATES.dbS1, mDb)
  const volBox = lerpBox(STATES.volS0, STATES.volS1, mVol)
  const envS01 = lerpBox(STATES.envS0, STATES.envS1, mEnv1)
  const envBox = lerpBox(envS01, STATES.cmS2, mCm)
  const secretBox = lerpBox(STATES.secretStart, STATES.secretS2, mSecret)

  const volStroke = interpolateColors(mVol, [0, 1], [INK, ORANGE])
  const envStroke = interpolateColors(mCm, [0, 1], [INK, ORANGE])

  const midY = 246
  const envEdgeApiX = apiBox.x + apiBox.w * (0.5 - 0.15 * mCm)
  const secretEdgeApiX = apiBox.x + apiBox.w * 0.65

  const label8080X = interpolate(mFrontend, [0, 1], [151, 196])
  const labelApi3000X = (frontendBox.x + frontendBox.w + apiBox.x) / 2
  const labelSqlX = (apiBox.x + apiBox.w + dbBox.x) / 2

  const jobCx = STATES.job.x + STATES.job.w / 2
  const svcPgEntryX = STATES.svcPg.x + STATES.svcPg.w - 6
  const elbowY = 400
  const jobToSvcPgPoints: ReadonlyArray<readonly [number, number]> = [
    [jobCx, STATES.job.y],
    [jobCx, elbowY],
    [svcPgEntryX, elbowY],
    [svcPgEntryX, STATES.svcPg.y + STATES.svcPg.h],
  ]

  return (
    <div
      style={{
        width: 1960,
        height: 1104,
        overflow: "hidden",
        backgroundColor: PAPER,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 980,
          height: 552,
          transform: "scale(2)",
          transformOrigin: "top left",
          backgroundColor: PAPER,
          backgroundImage: `url(${staticFile("paper-grain.svg")})`,
          backgroundSize: "400px 400px",
          backgroundRepeat: "repeat",
        }}
      >
        <svg
          width={980}
          height={552}
          viewBox="0 0 980 552"
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          {/* Boundaries */}
          <RoughRect
            id="docker-boundary"
            x={STATES.dockerBoundary.x}
            y={STATES.dockerBoundary.y}
            w={STATES.dockerBoundary.w}
            h={STATES.dockerBoundary.h}
            seed={10}
            stroke={INK_2}
            strokeWidth={1.5}
            fill="none"
            dashed
            drawProgress={dBoundary0}
            opacity={dockerFadeOut}
          />
          <RoughRect
            id="ns-boundary"
            x={STATES.nsBoundary.x}
            y={STATES.nsBoundary.y}
            w={STATES.nsBoundary.w}
            h={STATES.nsBoundary.h}
            seed={11}
            stroke={INK_2}
            strokeWidth={1.5}
            fill="none"
            dashed
            drawProgress={nsDraw}
            opacity={nsDraw > 0 ? 1 : 0}
          />

          {/* Primary Edges (behind nodes so Service boxes cover middle cleanly) */}
          <RoughEdge
            id="browser-fe"
            x1={STATES.browser.x + STATES.browser.w}
            y1={midY}
            x2={frontendBox.x}
            y2={midY}
            seed={101}
            arrow
            drawProgress={dEdge0}
            label="8080"
            labelX={label8080X}
            labelY={midY - 12}
            labelOpacity={s0Text * edgeLabelFade}
          />
          <RoughEdge
            id="fe-api"
            x1={frontendBox.x + frontendBox.w}
            y1={midY}
            x2={apiBox.x}
            y2={midY}
            seed={102}
            arrow
            drawProgress={dEdge1}
            label="api:3000"
            labelX={labelApi3000X}
            labelY={midY - 12}
            labelOpacity={s0Text * edgeLabelFade}
          />
          <RoughEdge
            id="api-db"
            x1={apiBox.x + apiBox.w}
            y1={midY}
            x2={dbBox.x}
            y2={midY}
            seed={103}
            arrow
            drawProgress={dEdge2}
            label="SQL"
            labelX={labelSqlX}
            labelY={midY - 12}
            labelOpacity={s0Text * edgeLabelFade}
          />

          {/* Config & Volume Dashed Edges */}
          <RoughEdge
            id="env-api"
            x1={envBox.x + envBox.w / 2}
            y1={envBox.y}
            x2={envEdgeApiX}
            y2={apiBox.y + apiBox.h}
            seed={104}
            dashed
            drawProgress={dEdgeEnv}
          />
          <RoughEdge
            id="secret-api"
            x1={secretBox.x + secretBox.w / 2}
            y1={secretBox.y}
            x2={secretEdgeApiX}
            y2={apiBox.y + apiBox.h}
            seed={105}
            dashed
            drawProgress={dEdgeSecret}
          />
          <RoughEdge
            id="vol-db"
            x1={volBox.x + volBox.w / 2}
            y1={volBox.y}
            x2={dbBox.x + dbBox.w / 2}
            y2={dbBox.y + dbBox.h}
            seed={106}
            dashed
            drawProgress={dEdgeVol}
          />

          {/* S4 Edges */}
          <RoughEdge
            id="cj-job"
            x1={STATES.cronJob.x + STATES.cronJob.w}
            y1={STATES.cronJob.y + STATES.cronJob.h / 2}
            x2={STATES.job.x}
            y2={STATES.job.y + STATES.job.h / 2}
            seed={107}
            arrow
            drawProgress={dEdgeCjJob}
          />
          <RoughEdge
            id="job-svcpg"
            x1={jobCx}
            y1={STATES.job.y}
            x2={svcPgEntryX}
            y2={STATES.svcPg.y + STATES.svcPg.h}
            points={jobToSvcPgPoints}
            seed={108}
            arrow
            singleStroke
            drawProgress={dEdgeJobPg}
          />

          {/* Persistent Nodes */}
          <NodeSvg
            id="browser"
            box={STATES.browser}
            seed={21}
            drawProgress={dBrowser}
            titleBarY={14}
          />
          <NodeSvg
            id="frontend"
            box={frontendBox}
            seed={22}
            drawProgress={dFrontend}
            ghosts={
              ghostWebT > 0.001
                ? [
                    {
                      dx: 4 * ghostWebT,
                      dy: -4 * ghostWebT,
                      opacity: ghostWebT,
                      seed: 221,
                    },
                  ]
                : undefined
            }
          />
          <NodeSvg
            id="api"
            box={apiBox}
            seed={23}
            drawProgress={dApi}
            ghosts={
              ghostApi1T > 0.001
                ? [
                    {
                      dx: 8 * ghostApi2T,
                      dy: -8 * ghostApi2T,
                      opacity: ghostApi2T,
                      seed: 232,
                    },
                    {
                      dx: 4 * ghostApi1T,
                      dy: -4 * ghostApi1T,
                      opacity: ghostApi1T,
                      seed: 231,
                    },
                  ]
                : undefined
            }
          />
          <NodeSvg id="database" box={dbBox} seed={24} drawProgress={dDb} />
          <NodeSvg
            id="volume"
            box={volBox}
            seed={25}
            stroke={volStroke}
            drawProgress={dVol}
          />
          <NodeSvg
            id="secret"
            box={secretBox}
            seed={27}
            stroke={ORANGE}
            opacity={secretOpacity}
          />
          <NodeSvg
            id="env"
            box={envBox}
            seed={26}
            stroke={envStroke}
            drawProgress={dEnv}
          />

          {/* S3 Services + Left-edge Arrowheads */}
          <NodeSvg
            id="svc-web"
            box={STATES.svcWeb}
            seed={31}
            stroke={ORANGE}
            opacity={svcWebT}
            scale={0.6 + 0.4 * svcWebT}
          />
          <RoughArrowhead
            id="svc-web-in"
            x={STATES.svcWeb.x}
            y={midY}
            angle={0}
            seed={310}
            opacity={svcWebT}
          />
          <NodeSvg
            id="svc-api"
            box={STATES.svcApi}
            seed={32}
            stroke={ORANGE}
            opacity={svcApiT}
            scale={0.6 + 0.4 * svcApiT}
          />
          <RoughArrowhead
            id="svc-api-in"
            x={STATES.svcApi.x}
            y={midY}
            angle={0}
            seed={320}
            opacity={svcApiT}
          />
          <NodeSvg
            id="svc-pg"
            box={STATES.svcPg}
            seed={33}
            stroke={ORANGE}
            opacity={svcPgT}
            scale={0.6 + 0.4 * svcPgT}
          />
          <RoughArrowhead
            id="svc-pg-in"
            x={STATES.svcPg.x}
            y={midY}
            angle={0}
            seed={330}
            opacity={svcPgT}
          />

          {/* S4 Additions */}
          <NodeSvg
            id="daemonset"
            box={STATES.daemonSet}
            seed={41}
            stroke={ORANGE}
            opacity={dsT}
            scale={0.85 + 0.15 * dsT}
          />
          <NodeSvg
            id="cronjob"
            box={STATES.cronJob}
            seed={42}
            stroke={ORANGE}
            opacity={cjT}
            scale={0.85 + 0.15 * cjT}
          />
          <NodeSvg
            id="job"
            box={STATES.job}
            seed={43}
            stroke={ORANGE}
            opacity={jobT}
            scale={0.85 + 0.15 * jobT}
          />
        </svg>

        {/* Boundary Labels */}
        {s0Text * dockerFadeOut > 0.001 && (
          <div
            style={{
              position: "absolute",
              left: STATES.dockerBoundary.x + 12,
              top: STATES.dockerBoundary.y + 8,
              fontFamily: FONT_SANS,
              fontSize: 16,
              fontWeight: 400,
              color: INK_2,
              lineHeight: 1.2,
              opacity: s0Text * dockerFadeOut,
            }}
          >
            Docker 主机（Compose）
          </div>
        )}
        {nsText > 0.001 && (
          <div
            style={{
              position: "absolute",
              left: STATES.nsBoundary.x + 12,
              top: STATES.nsBoundary.y + 8,
              fontFamily: FONT_SANS,
              fontSize: 16,
              fontWeight: 400,
              color: INK_2,
              lineHeight: 1.2,
              opacity: nsText,
            }}
          >
            命名空间 venue-booking
          </div>
        )}

        {/* Node Text & Icon Overlays */}
        <NodeOverlay
          box={STATES.browser}
          variant="browser"
          primary={{ label: "浏览器", opacity: s0Text }}
        />
        <NodeOverlay
          box={frontendBox}
          variant="tall"
          primary={{
            label: "frontend",
            sub: "nginx :8080",
            opacity: s0Text * s0LabelFadeOut,
          }}
          secondary={{
            label: "web",
            sub: "Deployment，\n2 副本",
            icon: "k8s/deploy-orange.svg",
            opacity: s1LabelFadeIn,
          }}
        />
        <NodeOverlay
          box={apiBox}
          variant="tall"
          primary={{
            label: "api",
            sub: "Node.js :3000",
            opacity: s0Text * s0LabelFadeOut,
          }}
          secondary={{
            label: "api",
            sub: "Deployment，\n3 副本",
            icon: "k8s/deploy-orange.svg",
            opacity: s1LabelFadeIn,
          }}
        />
        <NodeOverlay
          box={dbBox}
          variant="tall"
          primary={{
            label: "database",
            sub: "PostgreSQL :5432",
            opacity: s0Text * s0LabelFadeOut,
          }}
          secondary={{
            label: "postgres",
            sub: "StatefulSet，\n1 副本",
            icon: "k8s/sts-orange.svg",
            opacity: s1LabelFadeIn,
          }}
        />
        <NodeOverlay
          box={volBox}
          variant="compact"
          primary={{
            label: "数据卷",
            opacity: s0Text * s0LabelFadeOut,
          }}
          secondary={{
            label: "PVC 1Gi",
            icon: "k8s/pvc.svg",
            opacity: s1LabelFadeIn,
          }}
        />
        <NodeOverlay
          box={envBox}
          variant="compact"
          primary={{
            label: ".env",
            opacity: s0Text * envLabelOut,
          }}
          secondary={{
            label: "ConfigMap",
            icon: "k8s/cm.svg",
            opacity: cmLabelIn,
          }}
        />
        <NodeOverlay
          box={secretBox}
          variant="compact"
          opacity={secretOpacity}
          primary={{
            label: "Secret",
            icon: "k8s/secret.svg",
            opacity: secretLabelIn,
          }}
        />

        {/* S3 Services Overlays */}
        <NodeOverlay
          box={STATES.svcWeb}
          variant="service"
          opacity={svcWebT}
          scale={0.6 + 0.4 * svcWebT}
          primary={{
            label: "web",
            icon: "k8s/svc.svg",
            opacity: svcWebText,
          }}
          belowSub={{ text: "NodePort", opacity: svcWebText }}
        />
        <NodeOverlay
          box={STATES.svcApi}
          variant="service"
          opacity={svcApiT}
          scale={0.6 + 0.4 * svcApiT}
          primary={{
            label: "api",
            icon: "k8s/svc.svg",
            opacity: svcApiText,
          }}
          belowSub={{ text: "ClusterIP", opacity: svcApiText }}
        />
        <NodeOverlay
          box={STATES.svcPg}
          variant="service"
          opacity={svcPgT}
          scale={0.6 + 0.4 * svcPgT}
          primary={{
            label: "postgres",
            icon: "k8s/svc.svg",
            opacity: svcPgText,
          }}
          belowSub={{
            text: "Headless",
            opacity: svcPgText,
          }}
        />

        {/* S4 Additions Overlays */}
        <NodeOverlay
          box={STATES.daemonSet}
          variant="compact"
          opacity={dsT}
          scale={0.85 + 0.15 * dsT}
          primary={{
            label: "fluent-bit",
            sub: "DaemonSet",
            icon: "k8s/ds.svg",
            opacity: dsText,
          }}
        />
        <NodeOverlay
          box={STATES.cronJob}
          variant="compact"
          opacity={cjT}
          scale={0.85 + 0.15 * cjT}
          primary={{
            label: "CronJob",
            sub: "*/2 * * * *",
            icon: "k8s/cronjob.svg",
            opacity: cjText,
          }}
        />
        <NodeOverlay
          box={STATES.job}
          variant="compact"
          opacity={jobT}
          scale={0.85 + 0.15 * jobT}
          primary={{
            label: "Job",
            icon: "k8s/job.svg",
            opacity: jobText,
          }}
        />
      </div>
    </div>
  )
}
