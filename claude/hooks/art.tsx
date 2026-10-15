// Draws a scene (scenes.mjs) as Text rows: the pixels as half blocks in the
// monster's palette colors, then the effects column.
import type { ClientElements } from 'claude-code'

import { slotColor } from './lib/monsters.mjs'
import type { TamaMonster, TamaPalette } from '../types'

type Run = { text: string; fg?: string; bg?: string }
export type SceneData = { rows: Run[][]; fx: string[]; fxSlot: string; caption: string }

export function sceneRows(Text: ClientElements['Text'], monster: TamaMonster, palette: TamaPalette, data: SceneData) {
  const color = (slot?: string) => (slot ? slotColor(monster, slot, palette) : undefined)
  return data.rows.map((runs, i) => (
    <Text>
      {runs.map(run => (
        <Text color={color(run.fg)} backgroundColor={color(run.bg)}>
          {run.text}
        </Text>
      ))}
      <Text color={color(data.fxSlot)}>{' ' + (data.fx[i] ?? '')}</Text>
    </Text>
  ))
}
