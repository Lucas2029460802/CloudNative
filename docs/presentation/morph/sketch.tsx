import type { Options, PathInfo } from "roughjs/bin/core"
import rough from "roughjs"

export const PAPER = "#f3f2ee"
export const INK = "#1d1b18"
export const INK_2 = "#4b4741"
export const ORANGE = "#dc5f0c"
export const FONT_SANS = '"Noto Sans SC", sans-serif'

const generator = rough.generator()

function strokePaths(
  d: string,
  stroke: string,
  strokeWidth: number,
  dashed: boolean,
  drawProgress: number,
  maskId: string
) {
  if (drawProgress <= 0) {
    return null
  }
  const fullyDrawn = drawProgress >= 0.999
  if (!dashed) {
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={fullyDrawn ? undefined : 1}
        strokeDasharray={fullyDrawn ? undefined : "1 1"}
        strokeDashoffset={fullyDrawn ? undefined : 1 - drawProgress}
      />
    )
  }
  if (fullyDrawn) {
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }
  return (
    <>
      <defs>
        <mask id={maskId}>
          <path
            d={d}
            fill="none"
            stroke="#ffffff"
            strokeWidth={strokeWidth + 6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - drawProgress}
          />
        </mask>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
      />
    </>
  )
}

function renderPathInfos(
  paths: PathInfo[],
  stroke: string,
  strokeWidth: number,
  dashed: boolean,
  drawProgress: number,
  maskPrefix: string
) {
  return paths.map((info, idx) => {
    const isFill = info.fill !== undefined && info.fill !== "none"
    if (isFill) {
      return (
        <path
          key={`fill-${idx}`}
          d={info.d}
          fill={info.fill}
          stroke="none"
          opacity={drawProgress}
        />
      )
    }
    return (
      <g key={`stroke-${idx}`}>
        {strokePaths(
          info.d,
          stroke,
          strokeWidth,
          dashed,
          drawProgress,
          `${maskPrefix}-${idx}`
        )}
      </g>
    )
  })
}

export interface RoughRectProps {
  id: string
  x: number
  y: number
  w: number
  h: number
  seed: number
  stroke?: string
  strokeWidth?: number
  roughness?: number
  bowing?: number
  fill?: string
  dashed?: boolean
  drawProgress?: number
  opacity?: number
  titleBarY?: number
}

export function RoughRect({
  id,
  x,
  y,
  w,
  h,
  seed,
  stroke = INK,
  strokeWidth = 2,
  roughness = 1.2,
  bowing = 1,
  fill = PAPER,
  dashed = false,
  drawProgress = 1,
  opacity = 1,
  titleBarY,
}: RoughRectProps) {
  if (opacity <= 0.001 || drawProgress <= 0.001) {
    return null
  }
  const opts: Options = {
    seed,
    roughness,
    bowing,
    stroke,
    strokeWidth,
    ...(dashed ? { disableMultiStroke: true } : {}),
    ...(fill !== "none" ? { fill, fillStyle: "solid" } : {}),
  }
  const drawable = generator.rectangle(0, 0, w, h, opts)
  const paths = generator.toPaths(drawable)

  const titlePaths =
    titleBarY !== undefined
      ? generator.toPaths(
          generator.line(2, titleBarY, w - 2, titleBarY, {
            seed: seed + 50,
            roughness: 1.0,
            bowing: 0.8,
            stroke,
            strokeWidth: 1.6,
          })
        )
      : []

  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      {renderPathInfos(
        paths,
        stroke,
        strokeWidth,
        dashed,
        drawProgress,
        `rect-${id}`
      )}
      {titlePaths.map((info, idx) => (
        <g key={`title-${idx}`}>
          {strokePaths(
            info.d,
            stroke,
            1.6,
            false,
            drawProgress,
            `title-${id}-${idx}`
          )}
        </g>
      ))}
    </g>
  )
}

export interface ArrowheadProps {
  id: string
  x: number
  y: number
  angle: number
  seed: number
  stroke?: string
  strokeWidth?: number
  size?: number
  drawProgress?: number
  opacity?: number
}

export function RoughArrowhead({
  id,
  x,
  y,
  angle,
  seed,
  stroke = INK,
  strokeWidth = 2,
  size = 8,
  drawProgress = 1,
  opacity = 1,
}: ArrowheadProps) {
  if (opacity <= 0.001 || drawProgress <= 0.001) {
    return null
  }
  const spread = 0.48
  const wx1 = x - size * Math.cos(angle - spread)
  const wy1 = y - size * Math.sin(angle - spread)
  const wx2 = x - size * Math.cos(angle + spread)
  const wy2 = y - size * Math.sin(angle + spread)

  const wing1 = generator.toPaths(
    generator.line(wx1, wy1, x, y, {
      seed: seed + 101,
      roughness: 0.8,
      bowing: 0.5,
      stroke,
      strokeWidth,
    })
  )
  const wing2 = generator.toPaths(
    generator.line(wx2, wy2, x, y, {
      seed: seed + 202,
      roughness: 0.8,
      bowing: 0.5,
      stroke,
      strokeWidth,
    })
  )

  return (
    <g opacity={opacity}>
      {[...wing1, ...wing2].map((info, idx) => (
        <g key={`wing-${idx}`}>
          {strokePaths(
            info.d,
            stroke,
            strokeWidth,
            false,
            drawProgress,
            `arrow-${id}-${idx}`
          )}
        </g>
      ))}
    </g>
  )
}

export interface RoughEdgeProps {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  points?: ReadonlyArray<readonly [number, number]>
  seed: number
  stroke?: string
  strokeWidth?: number
  dashed?: boolean
  arrow?: boolean
  singleStroke?: boolean
  drawProgress?: number
  opacity?: number
  label?: string
  labelX?: number
  labelY?: number
  labelOpacity?: number
}

export function RoughEdge({
  id,
  x1,
  y1,
  x2,
  y2,
  points,
  seed,
  stroke = INK,
  strokeWidth = 2,
  dashed = false,
  arrow = false,
  singleStroke = false,
  drawProgress = 1,
  opacity = 1,
  label,
  labelX,
  labelY,
  labelOpacity = 1,
}: RoughEdgeProps) {
  if (opacity <= 0.001 || drawProgress <= 0.001) {
    return null
  }
  const hasPolyline = points !== undefined && points.length >= 2
  const endPt = hasPolyline ? points[points.length - 1] : undefined
  const prevPt = hasPolyline ? points[points.length - 2] : undefined
  const tipX = endPt ? endPt[0] : x2
  const tipY = endPt ? endPt[1] : y2
  const fromX = prevPt ? prevPt[0] : x1
  const fromY = prevPt ? prevPt[1] : y1
  const angle = Math.atan2(tipY - fromY, tipX - fromX)

  const lineOpts: Options = {
    seed,
    roughness: 1.0,
    bowing: hasPolyline ? 0.5 : 0.8,
    stroke,
    strokeWidth,
    ...(singleStroke ? { disableMultiStroke: true } : {}),
  }
  const drawable = hasPolyline
    ? generator.linearPath(
        points.map(([px, py]) => [px, py]),
        lineOpts
      )
    : generator.line(x1, y1, x2, y2, lineOpts)
  const paths = generator.toPaths(drawable)

  const arrowProgress = Math.max(0, Math.min(1, (drawProgress - 0.7) / 0.3))
  const lx = labelX ?? (x1 + x2) / 2
  const ly = labelY ?? (y1 + y2) / 2 - 10

  return (
    <g opacity={opacity}>
      {renderPathInfos(
        paths,
        stroke,
        strokeWidth,
        dashed,
        drawProgress,
        `edge-${id}`
      )}
      {arrow && !dashed && (
        <RoughArrowhead
          id={id}
          x={tipX}
          y={tipY}
          angle={angle}
          seed={seed}
          stroke={stroke}
          strokeWidth={strokeWidth}
          drawProgress={arrowProgress}
        />
      )}
      {label && labelOpacity > 0.001 && (
        <text
          x={lx}
          y={ly}
          textAnchor="middle"
          fontFamily={FONT_SANS}
          fontSize={16}
          fontWeight={400}
          fill={INK_2}
          stroke={PAPER}
          strokeWidth={4}
          paintOrder="stroke"
          opacity={labelOpacity}
        >
          {label}
        </text>
      )}
    </g>
  )
}
