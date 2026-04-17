export interface HuntPhoto {
  id: string
  hunt_id: string
  kill_ids: string[] | null
  storage_path: string
  url: string
  uploaded_by: string
  taken_at: string
  created_at: string
}
