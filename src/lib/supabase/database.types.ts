export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      chat_group_members: {
        Row: {
          group_id: string
          hidden_at: string | null
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          hidden_at?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          hidden_at?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string
          emoji: string | null
          hunt_id: string | null
          id: string
          kind: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by: string
          emoji?: string | null
          hunt_id?: string | null
          id?: string
          kind?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string
          emoji?: string | null
          hunt_id?: string | null
          id?: string
          kind?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          area_ha: number | null
          boundary: unknown
          bundesland: string | null
          created_at: string | null
          id: string
          name: string
          owner_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          area_ha?: number | null
          boundary?: unknown
          bundesland?: string | null
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          area_ha?: number | null
          boundary?: unknown
          bundesland?: string | null
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "districts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driven_hunt_rsvps: {
        Row: {
          created_at: string | null
          driven_hunt_id: string
          email: string | null
          gelaendefahig: boolean | null
          hund: boolean | null
          hunderasse: string | null
          id: string
          name: string
          notizen: string | null
          personen_anzahl: number | null
          phone: string | null
          responded_at: string | null
          schiessnachweis: boolean | null
          stand_id: string | null
          status: Database["public"]["Enums"]["rsvp_status"] | null
          uebernachtung: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          driven_hunt_id: string
          email?: string | null
          gelaendefahig?: boolean | null
          hund?: boolean | null
          hunderasse?: string | null
          id?: string
          name: string
          notizen?: string | null
          personen_anzahl?: number | null
          phone?: string | null
          responded_at?: string | null
          schiessnachweis?: boolean | null
          stand_id?: string | null
          status?: Database["public"]["Enums"]["rsvp_status"] | null
          uebernachtung?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          driven_hunt_id?: string
          email?: string | null
          gelaendefahig?: boolean | null
          hund?: boolean | null
          hunderasse?: string | null
          id?: string
          name?: string
          notizen?: string | null
          personen_anzahl?: number | null
          phone?: string | null
          responded_at?: string | null
          schiessnachweis?: boolean | null
          stand_id?: string | null
          status?: Database["public"]["Enums"]["rsvp_status"] | null
          uebernachtung?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driven_hunt_rsvps_driven_hunt_id_fkey"
            columns: ["driven_hunt_id"]
            isOneToOne: false
            referencedRelation: "driven_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driven_hunt_rsvps_stand_id_fkey"
            columns: ["stand_id"]
            isOneToOne: false
            referencedRelation: "driven_hunt_stands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driven_hunt_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driven_hunt_stands: {
        Row: {
          assigned_participant: string | null
          created_at: string | null
          driven_hunt_id: string
          id: string
          map_object_id: string | null
          name: string | null
          position: unknown
          sort_order: number | null
          treiben_nr: number | null
        }
        Insert: {
          assigned_participant?: string | null
          created_at?: string | null
          driven_hunt_id: string
          id?: string
          map_object_id?: string | null
          name?: string | null
          position?: unknown
          sort_order?: number | null
          treiben_nr?: number | null
        }
        Update: {
          assigned_participant?: string | null
          created_at?: string | null
          driven_hunt_id?: string
          id?: string
          map_object_id?: string | null
          name?: string | null
          position?: unknown
          sort_order?: number | null
          treiben_nr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driven_hunt_stands_driven_hunt_id_fkey"
            columns: ["driven_hunt_id"]
            isOneToOne: false
            referencedRelation: "driven_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driven_hunt_stands_map_object_id_fkey"
            columns: ["map_object_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      driven_hunts: {
        Row: {
          created_at: string | null
          creator_id: string
          datum: string
          district_id: string
          id: string
          name: string
          rsvp_code: string | null
          sicherheitseinweisung_url: string | null
          status: Database["public"]["Enums"]["driven_hunt_status"] | null
          updated_at: string | null
          zeitplan: Json | null
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          datum: string
          district_id: string
          id?: string
          name: string
          rsvp_code?: string | null
          sicherheitseinweisung_url?: string | null
          status?: Database["public"]["Enums"]["driven_hunt_status"] | null
          updated_at?: string | null
          zeitplan?: Json | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          datum?: string
          district_id?: string
          id?: string
          name?: string
          rsvp_code?: string | null
          sicherheitseinweisung_url?: string | null
          status?: Database["public"]["Enums"]["driven_hunt_status"] | null
          updated_at?: string | null
          zeitplan?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "driven_hunts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driven_hunts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      game_meat_customers: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_meat_customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_meat_invoices: {
        Row: {
          betrag: number | null
          bezahlt: boolean | null
          created_at: string | null
          customer_id: string
          gewicht_kg: number | null
          id: string
          invoice_nr: string | null
          kill_id: string | null
          owner_id: string
          pdf_url: string | null
          preis_pro_kg: number | null
          wild_art: Database["public"]["Enums"]["wild_art"] | null
        }
        Insert: {
          betrag?: number | null
          bezahlt?: boolean | null
          created_at?: string | null
          customer_id: string
          gewicht_kg?: number | null
          id?: string
          invoice_nr?: string | null
          kill_id?: string | null
          owner_id: string
          pdf_url?: string | null
          preis_pro_kg?: number | null
          wild_art?: Database["public"]["Enums"]["wild_art"] | null
        }
        Update: {
          betrag?: number | null
          bezahlt?: boolean | null
          created_at?: string | null
          customer_id?: string
          gewicht_kg?: number | null
          id?: string
          invoice_nr?: string | null
          kill_id?: string | null
          owner_id?: string
          pdf_url?: string | null
          preis_pro_kg?: number | null
          wild_art?: Database["public"]["Enums"]["wild_art"] | null
        }
        Relationships: [
          {
            foreignKeyName: "game_meat_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "game_meat_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_meat_invoices_kill_id_fkey"
            columns: ["kill_id"]
            isOneToOne: false
            referencedRelation: "kills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_meat_invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_group_members: {
        Row: {
          created_at: string | null
          default_role: Database["public"]["Enums"]["participant_role"] | null
          default_tags: Database["public"]["Enums"]["participant_tag"][] | null
          display_name: string
          group_id: string
          id: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_role?: Database["public"]["Enums"]["participant_role"] | null
          default_tags?: Database["public"]["Enums"]["participant_tag"][] | null
          display_name: string
          group_id: string
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_role?: Database["public"]["Enums"]["participant_role"] | null
          default_tags?: Database["public"]["Enums"]["participant_tag"][] | null
          display_name?: string
          group_id?: string
          id?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "hunt_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_groups: {
        Row: {
          created_at: string | null
          district_id: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          district_id?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_groups_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_participants: {
        Row: {
          created_at: string | null
          guest_name: string | null
          guest_token: string | null
          hunt_id: string
          id: string
          joined_at: string | null
          left_at: string | null
          role: Database["public"]["Enums"]["participant_role"] | null
          stand_id: string | null
          status: Database["public"]["Enums"]["participant_status"] | null
          tags: Database["public"]["Enums"]["participant_tag"][] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          guest_name?: string | null
          guest_token?: string | null
          hunt_id: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"] | null
          stand_id?: string | null
          status?: Database["public"]["Enums"]["participant_status"] | null
          tags?: Database["public"]["Enums"]["participant_tag"][] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          guest_name?: string | null
          guest_token?: string | null
          hunt_id?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"] | null
          stand_id?: string | null
          status?: Database["public"]["Enums"]["participant_status"] | null
          tags?: Database["public"]["Enums"]["participant_tag"][] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_participants_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_participants_stand_id_fkey"
            columns: ["stand_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_photos: {
        Row: {
          created_at: string | null
          hunt_id: string
          id: string
          kill_ids: string[] | null
          storage_path: string
          taken_at: string | null
          uploaded_by: string
          url: string
        }
        Insert: {
          created_at?: string | null
          hunt_id: string
          id?: string
          kill_ids?: string[] | null
          storage_path: string
          taken_at?: string | null
          uploaded_by: string
          url: string
        }
        Update: {
          created_at?: string | null
          hunt_id?: string
          id?: string
          kill_ids?: string[] | null
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_photos_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_seat_assignments: {
        Row: {
          adhoc_subtype: string | null
          created_at: string | null
          hunt_id: string
          id: string
          position_lat: number | null
          position_lng: number | null
          seat_id: string | null
          seat_name: string | null
          seat_type: string
          user_id: string | null
        }
        Insert: {
          adhoc_subtype?: string | null
          created_at?: string | null
          hunt_id: string
          id?: string
          position_lat?: number | null
          position_lng?: number | null
          seat_id?: string | null
          seat_name?: string | null
          seat_type?: string
          user_id?: string | null
        }
        Update: {
          adhoc_subtype?: string | null
          created_at?: string | null
          hunt_id?: string
          id?: string
          position_lat?: number | null
          position_lng?: number | null
          seat_id?: string | null
          seat_name?: string | null
          seat_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_seat_assignments_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_seat_assignments_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_seat_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunting_licenses: {
        Row: {
          auflagen: string | null
          created_at: string | null
          district_id: string
          holder_email: string | null
          holder_id: string | null
          holder_jagdschein_nr: string | null
          holder_name: string
          holder_phone: string | null
          id: string
          invite_code: string | null
          issuer_id: string
          jagdarten: Database["public"]["Enums"]["jagdart"][] | null
          kfz_kennzeichen: string | null
          kontingent: Json | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["jes_status"] | null
          updated_at: string | null
          valid_from: string
          valid_until: string
          zone_ids: string[] | null
        }
        Insert: {
          auflagen?: string | null
          created_at?: string | null
          district_id: string
          holder_email?: string | null
          holder_id?: string | null
          holder_jagdschein_nr?: string | null
          holder_name: string
          holder_phone?: string | null
          id?: string
          invite_code?: string | null
          issuer_id: string
          jagdarten?: Database["public"]["Enums"]["jagdart"][] | null
          kfz_kennzeichen?: string | null
          kontingent?: Json | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["jes_status"] | null
          updated_at?: string | null
          valid_from: string
          valid_until: string
          zone_ids?: string[] | null
        }
        Update: {
          auflagen?: string | null
          created_at?: string | null
          district_id?: string
          holder_email?: string | null
          holder_id?: string | null
          holder_jagdschein_nr?: string | null
          holder_name?: string
          holder_phone?: string | null
          id?: string
          invite_code?: string | null
          issuer_id?: string
          jagdarten?: Database["public"]["Enums"]["jagdart"][] | null
          kfz_kennzeichen?: string | null
          kontingent?: Json | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["jes_status"] | null
          updated_at?: string | null
          valid_from?: string
          valid_until?: string
          zone_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "hunting_licenses_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunting_licenses_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunting_licenses_issuer_id_fkey"
            columns: ["issuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hunts: {
        Row: {
          boundary: unknown
          created_at: string | null
          creator_id: string
          district_id: string | null
          driven_hunt_id: string | null
          end_time: string | null
          ended_at: string | null
          id: string
          invite_code: string
          kill_visibility: Database["public"]["Enums"]["kill_visibility"]
          kind: Database["public"]["Enums"]["hunt_kind"]
          last_activity_at: string
          name: string
          notiz: string | null
          share_total_strecke: boolean
          signal_mode: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["hunt_status"] | null
          type: Database["public"]["Enums"]["hunt_type"] | null
          updated_at: string | null
          wild_presets: Database["public"]["Enums"]["wild_art"][] | null
        }
        Insert: {
          boundary?: unknown
          created_at?: string | null
          creator_id: string
          district_id?: string | null
          driven_hunt_id?: string | null
          end_time?: string | null
          ended_at?: string | null
          id?: string
          invite_code: string
          kill_visibility?: Database["public"]["Enums"]["kill_visibility"]
          kind?: Database["public"]["Enums"]["hunt_kind"]
          last_activity_at?: string
          name: string
          notiz?: string | null
          share_total_strecke?: boolean
          signal_mode?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["hunt_status"] | null
          type?: Database["public"]["Enums"]["hunt_type"] | null
          updated_at?: string | null
          wild_presets?: Database["public"]["Enums"]["wild_art"][] | null
        }
        Update: {
          boundary?: unknown
          created_at?: string | null
          creator_id?: string
          district_id?: string | null
          driven_hunt_id?: string | null
          end_time?: string | null
          ended_at?: string | null
          id?: string
          invite_code?: string
          kill_visibility?: Database["public"]["Enums"]["kill_visibility"]
          kind?: Database["public"]["Enums"]["hunt_kind"]
          last_activity_at?: string
          name?: string
          notiz?: string | null
          share_total_strecke?: boolean
          signal_mode?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["hunt_status"] | null
          type?: Database["public"]["Enums"]["hunt_type"] | null
          updated_at?: string | null
          wild_presets?: Database["public"]["Enums"]["wild_art"][] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_hunts_driven_hunt"
            columns: ["driven_hunt_id"]
            isOneToOne: false
            referencedRelation: "driven_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      kills: {
        Row: {
          altersklasse: string | null
          created_at: string | null
          distance_m: number | null
          district_id: string | null
          erlegt_am: string | null
          foto_url: string | null
          freigabe_verkauf: boolean | null
          geschlecht: Database["public"]["Enums"]["geschlecht"] | null
          gewicht_kg: number | null
          hochsitz_id: string | null
          hunt_id: string | null
          id: string
          jagdart: Database["public"]["Enums"]["jagdart"] | null
          kaliber: string | null
          kapital: boolean
          nachsuche: boolean | null
          notiz: string | null
          participant_id: string | null
          position: unknown
          reporter_id: string
          shooting_plan_id: string | null
          status: Database["public"]["Enums"]["kill_status"]
          trichinen_ergebnis: string | null
          trichinen_pflicht: boolean | null
          updated_at: string | null
          verbleib: Database["public"]["Enums"]["verbleib"] | null
          waffe: string | null
          weather_snapshot: Json | null
          wild_art: Database["public"]["Enums"]["wild_art"]
          wild_event_id: string | null
          wildmarke_nr: string | null
        }
        Insert: {
          altersklasse?: string | null
          created_at?: string | null
          distance_m?: number | null
          district_id?: string | null
          erlegt_am?: string | null
          foto_url?: string | null
          freigabe_verkauf?: boolean | null
          geschlecht?: Database["public"]["Enums"]["geschlecht"] | null
          gewicht_kg?: number | null
          hochsitz_id?: string | null
          hunt_id?: string | null
          id?: string
          jagdart?: Database["public"]["Enums"]["jagdart"] | null
          kaliber?: string | null
          kapital?: boolean
          nachsuche?: boolean | null
          notiz?: string | null
          participant_id?: string | null
          position?: unknown
          reporter_id: string
          shooting_plan_id?: string | null
          status?: Database["public"]["Enums"]["kill_status"]
          trichinen_ergebnis?: string | null
          trichinen_pflicht?: boolean | null
          updated_at?: string | null
          verbleib?: Database["public"]["Enums"]["verbleib"] | null
          waffe?: string | null
          weather_snapshot?: Json | null
          wild_art: Database["public"]["Enums"]["wild_art"]
          wild_event_id?: string | null
          wildmarke_nr?: string | null
        }
        Update: {
          altersklasse?: string | null
          created_at?: string | null
          distance_m?: number | null
          district_id?: string | null
          erlegt_am?: string | null
          foto_url?: string | null
          freigabe_verkauf?: boolean | null
          geschlecht?: Database["public"]["Enums"]["geschlecht"] | null
          gewicht_kg?: number | null
          hochsitz_id?: string | null
          hunt_id?: string | null
          id?: string
          jagdart?: Database["public"]["Enums"]["jagdart"] | null
          kaliber?: string | null
          kapital?: boolean
          nachsuche?: boolean | null
          notiz?: string | null
          participant_id?: string | null
          position?: unknown
          reporter_id?: string
          shooting_plan_id?: string | null
          status?: Database["public"]["Enums"]["kill_status"]
          trichinen_ergebnis?: string | null
          trichinen_pflicht?: boolean | null
          updated_at?: string | null
          verbleib?: Database["public"]["Enums"]["verbleib"] | null
          waffe?: string | null
          weather_snapshot?: Json | null
          wild_art?: Database["public"]["Enums"]["wild_art"]
          wild_event_id?: string | null
          wildmarke_nr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kills_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kills_hochsitz_id_fkey"
            columns: ["hochsitz_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kills_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kills_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hunt_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kills_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kills_wild_event_id_fkey"
            columns: ["wild_event_id"]
            isOneToOne: false
            referencedRelation: "wild_events"
            referencedColumns: ["id"]
          },
        ]
      }
      link_previews: {
        Row: {
          description: string | null
          favicon_url: string | null
          fetch_failed: boolean
          fetched_at: string
          image_url: string | null
          og_type: string | null
          site_name: string | null
          title: string | null
          url: string
        }
        Insert: {
          description?: string | null
          favicon_url?: string | null
          fetch_failed?: boolean
          fetched_at?: string
          image_url?: string | null
          og_type?: string | null
          site_name?: string | null
          title?: string | null
          url: string
        }
        Update: {
          description?: string | null
          favicon_url?: string | null
          fetch_failed?: boolean
          fetched_at?: string
          image_url?: string | null
          og_type?: string | null
          site_name?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      map_object_photos: {
        Row: {
          created_at: string
          id: string
          map_object_id: string
          storage_path: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          map_object_id: string
          storage_path: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          map_object_id?: string
          storage_path?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_object_photos_map_object_id_fkey"
            columns: ["map_object_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_object_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_objects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          district_id: string | null
          id: string
          name: string
          photo_url: string | null
          position: unknown
          type: Database["public"]["Enums"]["map_object_type"]
          zone_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          name: string
          photo_url?: string | null
          position: unknown
          type: Database["public"]["Enums"]["map_object_type"]
          zone_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          position?: unknown
          type?: Database["public"]["Enums"]["map_object_type"]
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_map_objects_zone"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_objects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_objects_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          created_at: string | null
          group_id: string | null
          hunt_id: string | null
          id: string
          media_url: string | null
          participant_id: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          type: Database["public"]["Enums"]["message_type"] | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          hunt_id?: string | null
          id?: string
          media_url?: string | null
          participant_id?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          type?: Database["public"]["Enums"]["message_type"] | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          hunt_id?: string | null
          id?: string
          media_url?: string | null
          participant_id?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          type?: Database["public"]["Enums"]["message_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hunt_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          created_at: string | null
          description: string | null
          district_id: string | null
          foto_url: string | null
          hunt_id: string | null
          id: string
          observed_at: string | null
          position: unknown
          reporter_id: string
          type: Database["public"]["Enums"]["observation_type"]
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          district_id?: string | null
          foto_url?: string | null
          hunt_id?: string | null
          id?: string
          observed_at?: string | null
          position?: unknown
          reporter_id: string
          type: Database["public"]["Enums"]["observation_type"]
        }
        Update: {
          created_at?: string | null
          description?: string | null
          district_id?: string | null
          foto_url?: string | null
          hunt_id?: string | null
          id?: string
          observed_at?: string | null
          position?: unknown
          reporter_id?: string
          type?: Database["public"]["Enums"]["observation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "observations_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          accuracy: number | null
          created_at: string | null
          heading: number | null
          hunt_id: string
          id: string
          is_locked: boolean | null
          location: unknown
          participant_id: string
          recorded_at: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          heading?: number | null
          hunt_id: string
          id?: string
          is_locked?: boolean | null
          location: unknown
          participant_id: string
          recorded_at?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          heading?: number | null
          hunt_id?: string
          id?: string
          is_locked?: boolean | null
          location?: unknown
          participant_id?: string
          recorded_at?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hunt_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions_current: {
        Row: {
          accuracy: number | null
          heading: number | null
          hunt_id: string
          is_locked: boolean | null
          location: unknown
          participant_id: string
          speed: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          hunt_id: string
          is_locked?: boolean | null
          location: unknown
          participant_id: string
          speed?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          hunt_id?: string
          is_locked?: boolean | null
          location?: unknown
          participant_id?: string
          speed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_current_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_current_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "hunt_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anonymize_kills: boolean
          availability_status: string
          avatar_url: string | null
          created_at: string | null
          display_name: string
          id: string
          jagdschein_nr: string | null
          kaliber: string | null
          phone: string | null
          updated_at: string | null
          waffe: string | null
        }
        Insert: {
          anonymize_kills?: boolean
          availability_status?: string
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          id: string
          jagdschein_nr?: string | null
          kaliber?: string | null
          phone?: string | null
          updated_at?: string | null
          waffe?: string | null
        }
        Update: {
          anonymize_kills?: boolean
          availability_status?: string
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          jagdschein_nr?: string | null
          kaliber?: string | null
          phone?: string | null
          updated_at?: string | null
          waffe?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: []
      }
      shooting_plans: {
        Row: {
          altersklasse: string | null
          created_at: string | null
          district_id: string
          geschlecht: Database["public"]["Enums"]["geschlecht"] | null
          id: string
          jagdjahr: string
          soll: number
          wild_art: Database["public"]["Enums"]["wild_art"]
        }
        Insert: {
          altersklasse?: string | null
          created_at?: string | null
          district_id: string
          geschlecht?: Database["public"]["Enums"]["geschlecht"] | null
          id?: string
          jagdjahr: string
          soll?: number
          wild_art: Database["public"]["Enums"]["wild_art"]
        }
        Update: {
          altersklasse?: string | null
          created_at?: string | null
          district_id?: string
          geschlecht?: Database["public"]["Enums"]["geschlecht"] | null
          id?: string
          jagdjahr?: string
          soll?: number
          wild_art?: Database["public"]["Enums"]["wild_art"]
        }
        Relationships: [
          {
            foreignKeyName: "shooting_plans_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_requests: {
        Row: {
          abgeschlossen_am: string | null
          anschuss_position: unknown
          created_at: string | null
          district_id: string | null
          entfernung_m: number | null
          ergebnis_text: string | null
          fluchtrichtung_grad: number | null
          foto_url: string | null
          gemeldet_am: string | null
          handler_id: string | null
          handler_participant_id: string | null
          hochsitz_id: string | null
          hunt_id: string | null
          id: string
          marker_einwechsel: Json | null
          marker_flucht: Json | null
          marker_schuss: Json | null
          priority: Database["public"]["Enums"]["tracking_priority"] | null
          reporter_id: string
          status: Database["public"]["Enums"]["tracking_status"] | null
          stueck_anzahl: number | null
          wild_art: Database["public"]["Enums"]["wild_art"]
          zugewiesen_am: string | null
        }
        Insert: {
          abgeschlossen_am?: string | null
          anschuss_position?: unknown
          created_at?: string | null
          district_id?: string | null
          entfernung_m?: number | null
          ergebnis_text?: string | null
          fluchtrichtung_grad?: number | null
          foto_url?: string | null
          gemeldet_am?: string | null
          handler_id?: string | null
          handler_participant_id?: string | null
          hochsitz_id?: string | null
          hunt_id?: string | null
          id?: string
          marker_einwechsel?: Json | null
          marker_flucht?: Json | null
          marker_schuss?: Json | null
          priority?: Database["public"]["Enums"]["tracking_priority"] | null
          reporter_id: string
          status?: Database["public"]["Enums"]["tracking_status"] | null
          stueck_anzahl?: number | null
          wild_art: Database["public"]["Enums"]["wild_art"]
          zugewiesen_am?: string | null
        }
        Update: {
          abgeschlossen_am?: string | null
          anschuss_position?: unknown
          created_at?: string | null
          district_id?: string | null
          entfernung_m?: number | null
          ergebnis_text?: string | null
          fluchtrichtung_grad?: number | null
          foto_url?: string | null
          gemeldet_am?: string | null
          handler_id?: string | null
          handler_participant_id?: string | null
          hochsitz_id?: string | null
          hunt_id?: string | null
          id?: string
          marker_einwechsel?: Json | null
          marker_flucht?: Json | null
          marker_schuss?: Json | null
          priority?: Database["public"]["Enums"]["tracking_priority"] | null
          reporter_id?: string
          status?: Database["public"]["Enums"]["tracking_status"] | null
          stueck_anzahl?: number | null
          wild_art?: Database["public"]["Enums"]["wild_art"]
          zugewiesen_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_requests_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_requests_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_requests_handler_participant_id_fkey"
            columns: ["handler_participant_id"]
            isOneToOne: false
            referencedRelation: "hunt_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_requests_hochsitz_id_fkey"
            columns: ["hochsitz_id"]
            isOneToOne: false
            referencedRelation: "map_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_requests_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_requests_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string | null
          diary_default_view: string | null
          diary_share_anonymize: boolean | null
          updated_at: string | null
          user_id: string
          visible_wild_groups: Json | null
        }
        Insert: {
          created_at?: string | null
          diary_default_view?: string | null
          diary_share_anonymize?: boolean | null
          updated_at?: string | null
          user_id: string
          visible_wild_groups?: Json | null
        }
        Update: {
          created_at?: string | null
          diary_default_view?: string | null
          diary_share_anonymize?: boolean | null
          updated_at?: string | null
          user_id?: string
          visible_wild_groups?: Json | null
        }
        Relationships: []
      }
      wild_events: {
        Row: {
          count: number | null
          created_at: string | null
          hunt_id: string | null
          id: string
          location: unknown
          note: string | null
          occurred_at: string
          species: string | null
          type: Database["public"]["Enums"]["wild_event_type"]
          user_id: string
        }
        Insert: {
          count?: number | null
          created_at?: string | null
          hunt_id?: string | null
          id?: string
          location?: unknown
          note?: string | null
          occurred_at: string
          species?: string | null
          type: Database["public"]["Enums"]["wild_event_type"]
          user_id: string
        }
        Update: {
          count?: number | null
          created_at?: string | null
          hunt_id?: string | null
          id?: string
          location?: unknown
          note?: string | null
          occurred_at?: string
          species?: string | null
          type?: Database["public"]["Enums"]["wild_event_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wild_events_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          color: string | null
          created_at: string | null
          district_id: string
          id: string
          name: string
          polygon: unknown
          type: Database["public"]["Enums"]["zone_type"]
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          district_id: string
          id?: string
          name: string
          polygon: unknown
          type: Database["public"]["Enums"]["zone_type"]
        }
        Update: {
          color?: string | null
          created_at?: string | null
          district_id?: string
          id?: string
          name?: string
          polygon?: unknown
          type?: Database["public"]["Enums"]["zone_type"]
        }
        Relationships: [
          {
            foreignKeyName: "zones_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_districts_for_point: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          area_ha: number | null
          boundary: unknown
          bundesland: string | null
          created_at: string | null
          id: string
          name: string
          owner_id: string
          settings: Json | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "districts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_invite_code: { Args: never; Returns: string }
      get_my_chat_list: {
        Args: never
        Returns: {
          avatar_url: string
          emoji: string
          hidden_at: string
          hunt_id: string
          hunt_status: string
          id: string
          kind: string
          last_message_content: string
          last_message_created_at: string
          last_message_sender_id: string
          last_message_sender_name: string
          last_message_type: string
          members: Json
          my_last_read_at: string
          name: string
          unread_count: number
          updated_at: string
        }[]
      }
      get_my_created_group_ids: { Args: never; Returns: string[] }
      get_my_group_ids: { Args: never; Returns: string[] }
      get_my_hunt_ids: { Args: never; Returns: string[] }
      get_my_hunt_ids_as_leader: { Args: never; Returns: string[] }
      get_my_hunt_ids_as_leader_or_groupleader: {
        Args: never
        Returns: string[]
      }
      get_or_create_direct_chat: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_shooting_plan_actual: { Args: { plan_id: string }; Returns: number }
    }
    Enums: {
      driven_hunt_status: "entwurf" | "einladung" | "aktiv" | "abgeschlossen"
      geschlecht: "maennlich" | "weiblich" | "unbekannt"
      hunt_kind: "group" | "solo"
      hunt_status:
        | "draft"
        | "active"
        | "paused"
        | "completed"
        | "auto_completed"
      hunt_type: "ansitz" | "pirsch" | "drueckjagd" | "erntejagd"
      jagdart: "ansitz" | "pirsch" | "drueckjagd" | "erntejagd"
      jes_status: "aktiv" | "abgelaufen" | "entzogen" | "pausiert"
      kill_status: "harvested" | "wounded"
      kill_visibility: "all" | "leader_only" | "leader_and_groupleader"
      map_object_type:
        | "hochsitz"
        | "kanzel"
        | "drueckjagdstand"
        | "parkplatz"
        | "kirrung"
        | "salzlecke"
        | "wildkamera"
        | "sonstiges"
      message_type:
        | "text"
        | "photo"
        | "audio"
        | "signal"
        | "kill_report"
        | "tracking"
      observation_type:
        | "wildschaden"
        | "auffaelliges_wild"
        | "raubwild"
        | "wildkamera"
        | "infrastruktur"
        | "sonstiges"
      participant_role: "jagdleiter" | "schuetze"
      participant_status: "invited" | "joined" | "left"
      participant_tag: "gruppenleiter" | "hundefuehrer"
      rsvp_status: "offen" | "zugesagt" | "abgesagt"
      tracking_priority: "niedrig" | "mittel" | "hoch" | "sofort"
      tracking_status:
        | "gemeldet"
        | "zugewiesen"
        | "aktiv"
        | "gefunden"
        | "nicht_gefunden"
        | "abgebrochen"
      verbleib:
        | "eigenverbrauch"
        | "wildhandel"
        | "verkauf_privat"
        | "tierfund"
        | "unfall"
        | "sonstiges"
      wild_art:
        | "rehbock"
        | "ricke"
        | "rehkitz"
        | "keiler"
        | "bache"
        | "ueberlaeufer"
        | "frischling"
        | "rothirsch"
        | "rottier"
        | "rotkalb"
        | "damhirsch"
        | "damtier"
        | "damkalb"
        | "fuchs"
        | "dachs"
        | "waschbaer"
        | "marderhund"
        | "fasan"
        | "taube"
        | "kraehe"
        | "gans"
        | "sonstiges"
        | "rehwild_unspez"
        | "schwarzwild_unspez"
        | "rotwild_unspez"
        | "damwild_unspez"
        | "bockkitz"
        | "schmalbock"
        | "schmalreh"
        | "hase"
        | "wildkaninchen"
        | "ente"
        | "schmaltier_rot"
        | "spiesser_rot"
        | "schmaltier_dam"
        | "spiesser_dam"
      wild_event_type:
        | "sighting"
        | "shot"
        | "kill"
        | "miss"
        | "wounded"
        | "fallwild"
      zone_type: "jagdzone" | "ruhezone" | "wildschaden"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      driven_hunt_status: ["entwurf", "einladung", "aktiv", "abgeschlossen"],
      geschlecht: ["maennlich", "weiblich", "unbekannt"],
      hunt_kind: ["group", "solo"],
      hunt_status: ["draft", "active", "paused", "completed", "auto_completed"],
      hunt_type: ["ansitz", "pirsch", "drueckjagd", "erntejagd"],
      jagdart: ["ansitz", "pirsch", "drueckjagd", "erntejagd"],
      jes_status: ["aktiv", "abgelaufen", "entzogen", "pausiert"],
      kill_status: ["harvested", "wounded"],
      kill_visibility: ["all", "leader_only", "leader_and_groupleader"],
      map_object_type: [
        "hochsitz",
        "kanzel",
        "drueckjagdstand",
        "parkplatz",
        "kirrung",
        "salzlecke",
        "wildkamera",
        "sonstiges",
      ],
      message_type: [
        "text",
        "photo",
        "audio",
        "signal",
        "kill_report",
        "tracking",
      ],
      observation_type: [
        "wildschaden",
        "auffaelliges_wild",
        "raubwild",
        "wildkamera",
        "infrastruktur",
        "sonstiges",
      ],
      participant_role: ["jagdleiter", "schuetze"],
      participant_status: ["invited", "joined", "left"],
      participant_tag: ["gruppenleiter", "hundefuehrer"],
      rsvp_status: ["offen", "zugesagt", "abgesagt"],
      tracking_priority: ["niedrig", "mittel", "hoch", "sofort"],
      tracking_status: [
        "gemeldet",
        "zugewiesen",
        "aktiv",
        "gefunden",
        "nicht_gefunden",
        "abgebrochen",
      ],
      verbleib: [
        "eigenverbrauch",
        "wildhandel",
        "verkauf_privat",
        "tierfund",
        "unfall",
        "sonstiges",
      ],
      wild_art: [
        "rehbock",
        "ricke",
        "rehkitz",
        "keiler",
        "bache",
        "ueberlaeufer",
        "frischling",
        "rothirsch",
        "rottier",
        "rotkalb",
        "damhirsch",
        "damtier",
        "damkalb",
        "fuchs",
        "dachs",
        "waschbaer",
        "marderhund",
        "fasan",
        "taube",
        "kraehe",
        "gans",
        "sonstiges",
        "rehwild_unspez",
        "schwarzwild_unspez",
        "rotwild_unspez",
        "damwild_unspez",
        "bockkitz",
        "schmalbock",
        "schmalreh",
        "hase",
        "wildkaninchen",
        "ente",
        "schmaltier_rot",
        "spiesser_rot",
        "schmaltier_dam",
        "spiesser_dam",
      ],
      wild_event_type: [
        "sighting",
        "shot",
        "kill",
        "miss",
        "wounded",
        "fallwild",
      ],
      zone_type: ["jagdzone", "ruhezone", "wildschaden"],
    },
  },
} as const
