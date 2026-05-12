export const participant_idle_status = 'idle'
export const participant_handling_status = 'handling'

export type participant_status =
  | typeof participant_idle_status
  | typeof participant_handling_status
