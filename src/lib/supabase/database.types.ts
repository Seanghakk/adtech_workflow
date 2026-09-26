/**
 * GENERATED — do not edit by hand.
 *
 *   npx supabase gen types typescript --db-url "$ROLLBACK_TEST_DATABASE_URL" \
 *     --schema workflow > src/lib/supabase/database.types.ts
 *
 * Brief 106b. THIS FILE DID NOT EXIST BEFORE. Every Supabase client in this
 * app was constructed without a Database generic, so every table name was
 * just a string and every row was `any`. That is why migration 045 could drop
 * workflow.floor_sub_stages while tsc stayed clean and all 221 tests passed:
 * a green check on an app that would have failed in the browser on its first
 * request.
 *
 * WORKFLOW ONLY. DO NOT ADD `--schema public`.
 *
 * It was tried, on 26 Sep 2026, and measured. The generator makes `public`
 * the DEFAULT schema, while every client here is pinned to `workflow`
 * (db: { schema: 'workflow' }), so each .from('projects') then resolves
 * against public's empty table list: 1,624 errors instead of the real 137.
 *
 * The app makes exactly ONE cross-schema call — .schema('public') for
 * user_profiles in src/lib/auth/current-member.ts — and it is typed at that
 * call site on purpose. If you are here because that one call is producing a
 * type error, fix it there. Widening this generic to silence it trades one
 * narrow cast for sixteen hundred errors.
 *
 * Regenerate whenever a migration changes the schema, and BEFORE changing the
 * code that reads it — with the generic wired into server.ts, client.ts and
 * service.ts, a dropped table or a renamed column is a compile error, which is
 * what makes tsc mean anything across a reshape this size.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "workflow": {
          Tables: {
            "approval_steps": {
                  Row: {
                    "applies_to": string,"approver_role": string | null,"approver_team_id": string,"code": string,"created_at": string,"id": string,"is_active": boolean,"label_en": string,"label_km": string | null,"org_id": string,"scope_type": string | null,"sequence": number
                  }
                  Insert: {
                    "applies_to": string,"approver_role"?: string | null,"approver_team_id": string,"code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en": string,"label_km"?: string | null,"org_id"?: string,"scope_type"?: string | null,"sequence": number
                  }
                  Update: {
                    "applies_to"?: string,"approver_role"?: string | null,"approver_team_id"?: string,"code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string | null,"org_id"?: string,"scope_type"?: string | null,"sequence"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_steps_approver_team_id_fkey"
      columns: ["approver_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_steps_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"autocad_export_log": {
                  Row: {
                    "created_at": string,"exported_at": string,"exported_by": string,"id": string,"project_id": string,"snapshot": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"exported_at"?: string,"exported_by": string,"id"?: string,"project_id": string,"snapshot": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"exported_at"?: string,"exported_by"?: string,"id"?: string,"project_id"?: string,"snapshot"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "autocad_export_log_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"cad_systems": {
                  Row: {
                    "code": string,"created_at": string,"is_active": boolean,"label_en": string,"label_km": string,"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"is_active"?: boolean,"label_en": string,"label_km": string,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"catalogue_events": {
                  Row: {
                    "catalogue_item_id": string,"effective_date": string,"id": string,"lifecycle_step": number,"reason": string | null,"recorded_at": string,"recorded_by_id": string | null
                  }
                  Insert: {
                    "catalogue_item_id": string,"effective_date"?: string,"id"?: string,"lifecycle_step": number,"reason"?: string | null,"recorded_at"?: string,"recorded_by_id"?: string | null
                  }
                  Update: {
                    "catalogue_item_id"?: string,"effective_date"?: string,"id"?: string,"lifecycle_step"?: number,"reason"?: string | null,"recorded_at"?: string,"recorded_by_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalogue_events_catalogue_item_id_fkey"
      columns: ["catalogue_item_id"]
isOneToOne: false
      referencedRelation: "catalogue_items"
      referencedColumns: ["id"]
    }
                  ]
                },"catalogue_items": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"last_verified_at": string | null,"last_verified_by_id": string | null,"lifecycle_step": number,"manufacturer": string,"org_id": string,"part_number": string,"successor_item_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"last_verified_at"?: string | null,"last_verified_by_id"?: string | null,"lifecycle_step"?: number,"manufacturer": string,"org_id"?: string,"part_number": string,"successor_item_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"last_verified_at"?: string | null,"last_verified_by_id"?: string | null,"lifecycle_step"?: number,"manufacturer"?: string,"org_id"?: string,"part_number"?: string,"successor_item_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalogue_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalogue_items_successor_item_id_fkey"
      columns: ["successor_item_id"]
isOneToOne: false
      referencedRelation: "catalogue_items"
      referencedColumns: ["id"]
    }
                  ]
                },"checklist_items": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"label_en": string,"label_km": string | null,"sort_order": number,"template_id": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en": string,"label_km"?: string | null,"sort_order": number,"template_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string | null,"sort_order"?: number,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_items_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "checklist_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"checklist_templates": {
                  Row: {
                    "applies_to": string,"created_at": string,"id": string,"is_active": boolean,"label_en": string,"label_km": string | null,"org_id": string,"sort_order": number,"system_type": string
                  }
                  Insert: {
                    "applies_to": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en": string,"label_km"?: string | null,"org_id"?: string,"sort_order": number,"system_type": string
                  }
                  Update: {
                    "applies_to"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string | null,"org_id"?: string,"sort_order"?: number,"system_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_templates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"client_owners": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"client_id": string,"created_at": string,"id": string,"org_id": string,"sales_engineer_id": string,"updated_at": string
                  }
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"client_id": string,"created_at"?: string,"id"?: string,"org_id"?: string,"sales_engineer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"client_id"?: string,"created_at"?: string,"id"?: string,"org_id"?: string,"sales_engineer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_owners_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_owners_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"org_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"org_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_boq_line_locations": {
                  Row: {
                    "contract_boq_line_id": string,"location_label": string,"quantity": number
                  }
                  Insert: {
                    "contract_boq_line_id": string,"location_label": string,"quantity": number
                  }
                  Update: {
                    "contract_boq_line_id"?: string,"location_label"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_boq_line_locations_contract_boq_line_id_fkey"
      columns: ["contract_boq_line_id"]
isOneToOne: false
      referencedRelation: "contract_boq_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_boq_lines": {
                  Row: {
                    "brand": string | null,"created_at": string,"description": string,"id": string,"item_number": string | null,"project_id": string,"quantity": number,"requested_quantity": number,"section_label": string | null,"unit": string,"updated_at": string
                  }
                  Insert: {
                    "brand"?: string | null,"created_at"?: string,"description": string,"id"?: string,"item_number"?: string | null,"project_id": string,"quantity": number,"requested_quantity"?: number,"section_label"?: string | null,"unit": string,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"item_number"?: string | null,"project_id"?: string,"quantity"?: number,"requested_quantity"?: number,"section_label"?: string | null,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_boq_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"dependency_links": {
                  Row: {
                    "created_at": string,"days_allowed": number | null,"ended_at": string | null,"id": string,"name": string,"project_id": string,"sequence": number,"started_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"days_allowed"?: number | null,"ended_at"?: string | null,"id"?: string,"name": string,"project_id": string,"sequence": number,"started_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"days_allowed"?: number | null,"ended_at"?: string | null,"id"?: string,"name"?: string,"project_id"?: string,"sequence"?: number,"started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependency_links_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_documents": {
                  Row: {
                    "file": string,"id": string,"kind": string,"revision_id": string,"uploaded_at": string,"uploaded_by": string | null
                  }
                  Insert: {
                    "file": string,"id"?: string,"kind": string,"revision_id": string,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "file"?: string,"id"?: string,"kind"?: string,"revision_id"?: string,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_documents_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "material_approval_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_package_lines": {
                  Row: {
                    "contract_boq_line_id": string,"created_at": string,"id": string,"package_id": string,"removed_from_boq_at": string | null
                  }
                  Insert: {
                    "contract_boq_line_id": string,"created_at"?: string,"id"?: string,"package_id": string,"removed_from_boq_at"?: string | null
                  }
                  Update: {
                    "contract_boq_line_id"?: string,"created_at"?: string,"id"?: string,"package_id"?: string,"removed_from_boq_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_package_lines_contract_boq_line_id_fkey"
      columns: ["contract_boq_line_id"]
isOneToOne: true
      referencedRelation: "contract_boq_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_approval_package_lines_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "material_approval_packages"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_packages": {
                  Row: {
                    "created_at": string,"created_by": string | null,"current_rev": number,"id": string,"outside_boq_reason": string | null,"preparing_started_at": string | null,"project_id": string,"ref": string,"source": string,"system_id": string | null,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"current_rev"?: number,"id"?: string,"outside_boq_reason"?: string | null,"preparing_started_at"?: string | null,"project_id": string,"ref": string,"source"?: string,"system_id"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"current_rev"?: number,"id"?: string,"outside_boq_reason"?: string | null,"preparing_started_at"?: string | null,"project_id"?: string,"ref"?: string,"source"?: string,"system_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_packages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_approval_packages_system_id_fkey"
      columns: ["system_id"]
isOneToOne: false
      referencedRelation: "project_systems"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_ref_counters": {
                  Row: {
                    "next_seq": number,"project_id": string
                  }
                  Insert: {
                    "next_seq"?: number,"project_id": string
                  }
                  Update: {
                    "next_seq"?: number,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_ref_counters_project_id_fkey"
      columns: ["project_id"]
isOneToOne: true
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_revisions": {
                  Row: {
                    "created_at": string,"id": string,"manufacturer": string | null,"model": string | null,"package_id": string,"product": string | null,"rev": number,"started_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"manufacturer"?: string | null,"model"?: string | null,"package_id": string,"product"?: string | null,"rev": number,"started_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"manufacturer"?: string | null,"model"?: string | null,"package_id"?: string,"product"?: string | null,"rev"?: number,"started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_revisions_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "material_approval_packages"
      referencedColumns: ["id"]
    }
                  ]
                },"material_approval_submissions": {
                  Row: {
                    "code": string | null,"comments": string | null,"created_at": string,"id": string,"org": string | null,"party": string,"recorded_by": string | null,"returned_on": string | null,"revision_id": string,"sent_on": string | null,"updated_at": string
                  }
                  Insert: {
                    "code"?: string | null,"comments"?: string | null,"created_at"?: string,"id"?: string,"org"?: string | null,"party": string,"recorded_by"?: string | null,"returned_on"?: string | null,"revision_id": string,"sent_on"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string | null,"comments"?: string | null,"created_at"?: string,"id"?: string,"org"?: string | null,"party"?: string,"recorded_by"?: string | null,"returned_on"?: string | null,"revision_id"?: string,"sent_on"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_approval_submissions_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "material_approval_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"is_superadmin": boolean,"org_id": string,"role": string,"team_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_superadmin"?: boolean,"org_id"?: string,"role"?: string,"team_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_superadmin"?: boolean,"org_id"?: string,"role"?: string,"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"procurement_line_floors": {
                  Row: {
                    "floor_id": string,"procurement_line_id": string
                  }
                  Insert: {
                    "floor_id": string,"procurement_line_id": string
                  }
                  Update: {
                    "floor_id"?: string,"procurement_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "procurement_line_floors_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_line_floors_procurement_line_id_fkey"
      columns: ["procurement_line_id"]
isOneToOne: false
      referencedRelation: "procurement_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"procurement_lines": {
                  Row: {
                    "assigned_to": string | null,"contract_boq_line_id": string | null,"created_at": string,"customs_status": string | null,"delivery_last_received_at": string | null,"delivery_received": number,"delivery_total": number | null,"description": string,"id": string,"mr_approved_at": string | null,"mr_submitted_at": string | null,"override_accepted_at": string | null,"override_accepted_by": string | null,"override_package_id": string | null,"override_revision_id": string | null,"po_issued_at": string | null,"project_id": string,"raised_before_approval": boolean | null,"sourcing_started_at": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "assigned_to"?: string | null,"contract_boq_line_id"?: string | null,"created_at"?: string,"customs_status"?: string | null,"delivery_last_received_at"?: string | null,"delivery_received"?: number,"delivery_total"?: number | null,"description": string,"id"?: string,"mr_approved_at"?: string | null,"mr_submitted_at"?: string | null,"override_accepted_at"?: string | null,"override_accepted_by"?: string | null,"override_package_id"?: string | null,"override_revision_id"?: string | null,"po_issued_at"?: string | null,"project_id": string,"raised_before_approval"?: boolean | null,"sourcing_started_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "assigned_to"?: string | null,"contract_boq_line_id"?: string | null,"created_at"?: string,"customs_status"?: string | null,"delivery_last_received_at"?: string | null,"delivery_received"?: number,"delivery_total"?: number | null,"description"?: string,"id"?: string,"mr_approved_at"?: string | null,"mr_submitted_at"?: string | null,"override_accepted_at"?: string | null,"override_accepted_by"?: string | null,"override_package_id"?: string | null,"override_revision_id"?: string | null,"po_issued_at"?: string | null,"project_id"?: string,"raised_before_approval"?: boolean | null,"sourcing_started_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "procurement_lines_contract_boq_line_id_fkey"
      columns: ["contract_boq_line_id"]
isOneToOne: false
      referencedRelation: "contract_boq_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_lines_override_package_id_fkey"
      columns: ["override_package_id"]
isOneToOne: false
      referencedRelation: "material_approval_packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_lines_override_revision_id_fkey"
      columns: ["override_revision_id"]
isOneToOne: false
      referencedRelation: "material_approval_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "procurement_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"progress_cells": {
                  Row: {
                    "created_at": string,"floor_id": string,"id": string,"photo_url": string | null,"project_system_id": string,"reason": string | null,"sequence": number,"stage": string,"status": string,"sub_stage": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"floor_id": string,"id"?: string,"photo_url"?: string | null,"project_system_id": string,"reason"?: string | null,"sequence": number,"stage": string,"status"?: string,"sub_stage": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"floor_id"?: string,"id"?: string,"photo_url"?: string | null,"project_system_id"?: string,"reason"?: string | null,"sequence"?: number,"stage"?: string,"status"?: string,"sub_stage"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_cells_within_coverage"
      columns: ["project_system_id","floor_id"]
isOneToOne: false
      referencedRelation: "project_system_floors"
      referencedColumns: ["project_system_id","floor_id"]
    }
                  ]
                },"progress_updates": {
                  Row: {
                    "author_id": string,"created_at": string,"delta": number | null,"id": string,"is_no_change": boolean,"meets_threshold": boolean | null,"new_percent": number | null,"old_percent": number | null,"org_id": string,"period_id": string | null,"photo_url": string | null,"reason_code": string,"reason_note": string | null,"recorded_at": string,"subject_id": string,"subject_type": string
                  }
                  Insert: {
                    "author_id": string,"created_at"?: string,"delta"?: number | null,"id"?: string,"is_no_change"?: boolean,"meets_threshold"?: never,"new_percent"?: number | null,"old_percent"?: number | null,"org_id"?: string,"period_id"?: string | null,"photo_url"?: string | null,"reason_code": string,"reason_note"?: string | null,"recorded_at"?: string,"subject_id": string,"subject_type": string
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"delta"?: number | null,"id"?: string,"is_no_change"?: boolean,"meets_threshold"?: never,"new_percent"?: number | null,"old_percent"?: number | null,"org_id"?: string,"period_id"?: string | null,"photo_url"?: string | null,"reason_code"?: string,"reason_note"?: string | null,"recorded_at"?: string,"subject_id"?: string,"subject_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_updates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_updates_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "reporting_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_updates_reason_code_fkey"
      columns: ["reason_code"]
isOneToOne: false
      referencedRelation: "reason_codes"
      referencedColumns: ["code"]
    }
                  ]
                },"project_floors": {
                  Row: {
                    "created_at": string,"drawing_code": string | null,"id": string,"label": string,"project_id": string,"sort_order": number,"tower_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"drawing_code"?: string | null,"id"?: string,"label": string,"project_id": string,"sort_order": number,"tower_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"drawing_code"?: string | null,"id"?: string,"label"?: string,"project_id"?: string,"sort_order"?: number,"tower_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_floors_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_floors_tower_id_fkey"
      columns: ["tower_id"]
isOneToOne: false
      referencedRelation: "project_towers"
      referencedColumns: ["id"]
    }
                  ]
                },"project_handover_items": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"deliverable": string,"document_url": string | null,"id": string,"project_id": string,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"deliverable": string,"document_url"?: string | null,"id"?: string,"project_id": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"deliverable"?: string,"document_url"?: string | null,"id"?: string,"project_id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_handover_items_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_items": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"id": string,"opened_at": string,"pic_id": string | null,"project_id": string,"scheduled_date": string | null,"status": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string,"pic_id"?: string | null,"project_id": string,"scheduled_date"?: string | null,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"id"?: string,"opened_at"?: string,"pic_id"?: string | null,"project_id"?: string,"scheduled_date"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_items_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_milestones": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"project_id": string,"target_date": string,"target_percent": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"project_id": string,"target_date": string,"target_percent": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"project_id"?: string,"target_date"?: string,"target_percent"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_milestones_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_progress_history": {
                  Row: {
                    "changed_by": string | null,"id": string,"percent_calculated": number | null,"percent_complete": number,"project_id": string,"recorded_at": string,"source": string
                  }
                  Insert: {
                    "changed_by"?: string | null,"id"?: string,"percent_calculated"?: number | null,"percent_complete": number,"project_id": string,"recorded_at"?: string,"source": string
                  }
                  Update: {
                    "changed_by"?: string | null,"id"?: string,"percent_calculated"?: number | null,"percent_complete"?: number,"project_id"?: string,"recorded_at"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_progress_history_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_system_floors": {
                  Row: {
                    "added_at": string,"added_by": string | null,"floor_id": string,"id": string,"project_system_id": string,"removed_at": string | null,"source": string
                  }
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"floor_id": string,"id"?: string,"project_system_id": string,"removed_at"?: string | null,"source"?: string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"floor_id"?: string,"id"?: string,"project_system_id"?: string,"removed_at"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_system_floors_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_system_floors_project_system_id_fkey"
      columns: ["project_system_id"]
isOneToOne: false
      referencedRelation: "project_systems"
      referencedColumns: ["id"]
    }
                  ]
                },"project_systems": {
                  Row: {
                    "cad_code": string | null,"created_at": string,"id": string,"name": string,"project_id": string,"source": string,"updated_at": string
                  }
                  Insert: {
                    "cad_code"?: string | null,"created_at"?: string,"id"?: string,"name": string,"project_id": string,"source"?: string,"updated_at"?: string
                  }
                  Update: {
                    "cad_code"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"project_id"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_systems_cad_code_fkey"
      columns: ["cad_code"]
isOneToOne: false
      referencedRelation: "cad_systems"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "project_systems_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_towers": {
                  Row: {
                    "created_at": string,"id": string,"label": string,"project_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"label": string,"project_id": string,"sort_order": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string,"project_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_towers_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "cad_consultant_name": string | null,"cad_owner_name": string | null,"client_id": string,"closed_at": string | null,"contract_value": number | null,"created_at": string,"current_stage_id": string | null,"drawing_numbering_mode": string | null,"id": string,"is_maintenance_contract": boolean,"last_meaningful_movement_at": string | null,"name": string,"opened_at": string,"org_id": string,"owner_id": string | null,"percent_calculated": number | null,"percent_complete": number,"percent_override_at": string | null,"pic_id": string | null,"scope_type": string | null,"site_id": string | null,"so_assigned_at": string | null,"so_number": string | null,"so_register_id": string | null,"start_date": string | null,"status": string,"stream": string,"target_date": string | null,"updated_at": string
                  }
                  Insert: {
                    "cad_consultant_name"?: string | null,"cad_owner_name"?: string | null,"client_id": string,"closed_at"?: string | null,"contract_value"?: number | null,"created_at"?: string,"current_stage_id"?: string | null,"drawing_numbering_mode"?: string | null,"id"?: string,"is_maintenance_contract"?: boolean,"last_meaningful_movement_at"?: string | null,"name": string,"opened_at"?: string,"org_id"?: string,"owner_id"?: string | null,"percent_calculated"?: number | null,"percent_complete"?: number,"percent_override_at"?: string | null,"pic_id"?: string | null,"scope_type"?: string | null,"site_id"?: string | null,"so_assigned_at"?: string | null,"so_number"?: string | null,"so_register_id"?: string | null,"start_date"?: string | null,"status"?: string,"stream": string,"target_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cad_consultant_name"?: string | null,"cad_owner_name"?: string | null,"client_id"?: string,"closed_at"?: string | null,"contract_value"?: number | null,"created_at"?: string,"current_stage_id"?: string | null,"drawing_numbering_mode"?: string | null,"id"?: string,"is_maintenance_contract"?: boolean,"last_meaningful_movement_at"?: string | null,"name"?: string,"opened_at"?: string,"org_id"?: string,"owner_id"?: string | null,"percent_calculated"?: number | null,"percent_complete"?: number,"percent_override_at"?: string | null,"pic_id"?: string | null,"scope_type"?: string | null,"site_id"?: string | null,"so_assigned_at"?: string | null,"so_number"?: string | null,"so_register_id"?: string | null,"start_date"?: string | null,"status"?: string,"stream"?: string,"target_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_current_stage_id_fkey"
      columns: ["current_stage_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_so_register_id_fkey"
      columns: ["so_register_id"]
isOneToOne: false
      referencedRelation: "so_registers"
      referencedColumns: ["id"]
    }
                  ]
                },"qc_inspection_floors": {
                  Row: {
                    "floor_id": string,"qc_inspection_id": string
                  }
                  Insert: {
                    "floor_id": string,"qc_inspection_id": string
                  }
                  Update: {
                    "floor_id"?: string,"qc_inspection_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qc_inspection_floors_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "qc_inspection_floors_qc_inspection_id_fkey"
      columns: ["qc_inspection_id"]
isOneToOne: false
      referencedRelation: "qc_inspections"
      referencedColumns: ["id"]
    }
                  ]
                },"qc_inspections": {
                  Row: {
                    "approval_package_id": string | null,"created_at": string,"id": string,"inspected_at": string | null,"inspection_type": string,"inspector_id": string | null,"notes": string | null,"progress_cell_id": string | null,"project_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "approval_package_id"?: string | null,"created_at"?: string,"id"?: string,"inspected_at"?: string | null,"inspection_type": string,"inspector_id"?: string | null,"notes"?: string | null,"progress_cell_id"?: string | null,"project_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approval_package_id"?: string | null,"created_at"?: string,"id"?: string,"inspected_at"?: string | null,"inspection_type"?: string,"inspector_id"?: string | null,"notes"?: string | null,"progress_cell_id"?: string | null,"project_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qc_inspections_approval_package_id_fkey"
      columns: ["approval_package_id"]
isOneToOne: false
      referencedRelation: "material_approval_packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "qc_inspections_progress_cell_id_fkey"
      columns: ["progress_cell_id"]
isOneToOne: false
      referencedRelation: "progress_cells"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "qc_inspections_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"reason_codes": {
                  Row: {
                    "code": string,"created_at": string,"is_active": boolean,"label_en": string,"label_km": string,"sort_order": number,"stream": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"is_active"?: boolean,"label_en": string,"label_km": string,"sort_order"?: number,"stream"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string,"sort_order"?: number,"stream"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reporting_periods": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"starts_on": string,"stream": string | null
                  }
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"starts_on": string,"stream"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"starts_on"?: string,"stream"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"request_handoffs": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"from_owner_id": string | null,"id": string,"request_id": string,"stage": string | null,"started_at": string,"to_owner_id": string
                  }
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"from_owner_id"?: string | null,"id"?: string,"request_id": string,"stage"?: string | null,"started_at"?: string,"to_owner_id": string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"from_owner_id"?: string | null,"id"?: string,"request_id"?: string,"stage"?: string | null,"started_at"?: string,"to_owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "request_handoffs_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"requests": {
                  Row: {
                    "body": string,"client_id": string | null,"closed_at": string | null,"created_at": string,"current_owner_id": string | null,"current_stage_id": string | null,"destination_team_id": string | null,"destination_unsure": boolean,"id": string,"opened_at": string,"org_id": string,"project_id": string | null,"requester_id": string,"scope_type": string | null,"site_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "body": string,"client_id"?: string | null,"closed_at"?: string | null,"created_at"?: string,"current_owner_id"?: string | null,"current_stage_id"?: string | null,"destination_team_id"?: string | null,"destination_unsure"?: boolean,"id"?: string,"opened_at"?: string,"org_id"?: string,"project_id"?: string | null,"requester_id": string,"scope_type"?: string | null,"site_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"client_id"?: string | null,"closed_at"?: string | null,"created_at"?: string,"current_owner_id"?: string | null,"current_stage_id"?: string | null,"destination_team_id"?: string | null,"destination_unsure"?: boolean,"id"?: string,"opened_at"?: string,"org_id"?: string,"project_id"?: string | null,"requester_id"?: string,"scope_type"?: string | null,"site_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_current_stage_id_fkey"
      columns: ["current_stage_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_destination_team_id_fkey"
      columns: ["destination_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_scope_type_fkey"
      columns: ["scope_type"]
isOneToOne: false
      referencedRelation: "scope_types"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "requests_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"scope_types": {
                  Row: {
                    "code": string,"created_at": string,"is_active": boolean,"label_en": string,"label_km": string,"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"is_active"?: boolean,"label_en": string,"label_km": string,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"shop_drawing_boq_line_locations": {
                  Row: {
                    "floor_id": string | null,"location_label": string,"quantity": number,"shop_drawing_boq_line_id": string
                  }
                  Insert: {
                    "floor_id"?: string | null,"location_label": string,"quantity": number,"shop_drawing_boq_line_id": string
                  }
                  Update: {
                    "floor_id"?: string | null,"location_label"?: string,"quantity"?: number,"shop_drawing_boq_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_boq_line_locations_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shop_drawing_boq_line_locations_shop_drawing_boq_line_id_fkey"
      columns: ["shop_drawing_boq_line_id"]
isOneToOne: false
      referencedRelation: "shop_drawing_boq_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_drawing_boq_lines": {
                  Row: {
                    "brand": string | null,"created_at": string,"description": string,"id": string,"item_number": string | null,"model": string | null,"part_number": string | null,"project_id": string,"remarks": string | null,"requested_quantity": number,"system_type": string,"total_quantity": number,"unit": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "brand"?: string | null,"created_at"?: string,"description": string,"id"?: string,"item_number"?: string | null,"model"?: string | null,"part_number"?: string | null,"project_id": string,"remarks"?: string | null,"requested_quantity"?: number,"system_type": string,"total_quantity": number,"unit": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "brand"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"item_number"?: string | null,"model"?: string | null,"part_number"?: string | null,"project_id"?: string,"remarks"?: string | null,"requested_quantity"?: number,"system_type"?: string,"total_quantity"?: number,"unit"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_boq_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_drawing_boq_location_map": {
                  Row: {
                    "created_at": string,"floor_id": string | null,"location_label": string,"project_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"floor_id"?: string | null,"location_label": string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"floor_id"?: string | null,"location_label"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_boq_location_map_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shop_drawing_boq_location_map_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_drawing_checks": {
                  Row: {
                    "checked_at": string,"checked_by": string,"created_at": string,"id": string,"item_id": string,"revision": number
                  }
                  Insert: {
                    "checked_at": string,"checked_by": string,"created_at"?: string,"id"?: string,"item_id": string,"revision": number
                  }
                  Update: {
                    "checked_at"?: string,"checked_by"?: string,"created_at"?: string,"id"?: string,"item_id"?: string,"revision"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_checks_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "shop_drawing_items"
      referencedColumns: ["id"]
    }
                  ]
                },"shop_drawing_items": {
                  Row: {
                    "approver_id": string | null,"created_at": string,"created_by": string | null,"drafter_id": string | null,"drafting_started_at": string | null,"drawing_number": string | null,"drawing_type": string,"floor_id": string | null,"id": string,"legacy_done_no_lifecycle_history": boolean,"pre_submission_stage": string | null,"project_id": string,"scope": string,"status": string,"system_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "approver_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"drafter_id"?: string | null,"drafting_started_at"?: string | null,"drawing_number"?: string | null,"drawing_type": string,"floor_id"?: string | null,"id"?: string,"legacy_done_no_lifecycle_history"?: boolean,"pre_submission_stage"?: string | null,"project_id": string,"scope": string,"status"?: string,"system_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approver_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"drafter_id"?: string | null,"drafting_started_at"?: string | null,"drawing_number"?: string | null,"drawing_type"?: string,"floor_id"?: string | null,"id"?: string,"legacy_done_no_lifecycle_history"?: boolean,"pre_submission_stage"?: string | null,"project_id"?: string,"scope"?: string,"status"?: string,"system_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_items_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shop_drawing_items_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shop_drawing_items_system_id_fkey"
      columns: ["system_id"]
isOneToOne: false
      referencedRelation: "project_systems"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shop_drawing_items_system_same_project_fkey"
      columns: ["project_id","system_id"]
isOneToOne: false
      referencedRelation: "project_systems"
      referencedColumns: ["project_id","id"]
    }
                  ]
                },"shop_drawing_submissions": {
                  Row: {
                    "checked_at": string,"checked_by": string,"code": string | null,"comments": string | null,"created_at": string,"id": string,"item_id": string,"returned_at": string | null,"reviewer_org": string | null,"reviewer_party": string,"revision": number,"submitted_at": string,"submitted_by": string,"updated_at": string
                  }
                  Insert: {
                    "checked_at": string,"checked_by": string,"code"?: string | null,"comments"?: string | null,"created_at"?: string,"id"?: string,"item_id": string,"returned_at"?: string | null,"reviewer_org"?: string | null,"reviewer_party": string,"revision": number,"submitted_at"?: string,"submitted_by": string,"updated_at"?: string
                  }
                  Update: {
                    "checked_at"?: string,"checked_by"?: string,"code"?: string | null,"comments"?: string | null,"created_at"?: string,"id"?: string,"item_id"?: string,"returned_at"?: string | null,"reviewer_org"?: string | null,"reviewer_party"?: string,"revision"?: number,"submitted_at"?: string,"submitted_by"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shop_drawing_submissions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "shop_drawing_items"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "client_id": string,"created_at": string,"id": string,"name": string,"org_id": string,"updated_at": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"id"?: string,"name": string,"org_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"so_registers": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"label_en": string,"label_km": string | null,"org_id": string,"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en": string,"label_km"?: string | null,"org_id"?: string,"sort_order": number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string | null,"org_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "so_registers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"stages": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"is_terminal": boolean,"label_en": string,"label_km": string | null,"org_id": string,"owner_team_id": string,"scope_type": string,"sequence": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_terminal"?: boolean,"label_en": string,"label_km"?: string | null,"org_id"?: string,"owner_team_id": string,"scope_type": string,"sequence": number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_terminal"?: boolean,"label_en"?: string,"label_km"?: string | null,"org_id"?: string,"owner_team_id"?: string,"scope_type"?: string,"sequence"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stages_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stages_owner_team_id_fkey"
      columns: ["owner_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stages_scope_type_fkey"
      columns: ["scope_type"]
isOneToOne: false
      referencedRelation: "scope_types"
      referencedColumns: ["code"]
    }
                  ]
                },"teams": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"label_en": string,"label_km": string | null,"org_id": string,"sort_order": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en": string,"label_km"?: string | null,"org_id"?: string,"sort_order": number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label_en"?: string,"label_km"?: string | null,"org_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"tender_boq_line_locations": {
                  Row: {
                    "location_label": string,"quantity": number,"tender_boq_line_id": string
                  }
                  Insert: {
                    "location_label": string,"quantity": number,"tender_boq_line_id": string
                  }
                  Update: {
                    "location_label"?: string,"quantity"?: number,"tender_boq_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tender_boq_line_locations_tender_boq_line_id_fkey"
      columns: ["tender_boq_line_id"]
isOneToOne: false
      referencedRelation: "tender_boq_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"tender_boq_lines": {
                  Row: {
                    "brand": string | null,"created_at": string,"description": string,"id": string,"item_number": string | null,"model": string | null,"part_number": string | null,"project_id": string,"remarks": string | null,"requested_quantity": number,"system_type": string,"total_quantity": number,"unit": string,"updated_at": string
                  }
                  Insert: {
                    "brand"?: string | null,"created_at"?: string,"description": string,"id"?: string,"item_number"?: string | null,"model"?: string | null,"part_number"?: string | null,"project_id": string,"remarks"?: string | null,"requested_quantity"?: number,"system_type": string,"total_quantity": number,"unit": string,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"item_number"?: string | null,"model"?: string | null,"part_number"?: string | null,"project_id"?: string,"remarks"?: string | null,"requested_quantity"?: number,"system_type"?: string,"total_quantity"?: number,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tender_boq_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"tender_boq_location_map": {
                  Row: {
                    "created_at": string,"floor_id": string | null,"location_label": string,"project_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"floor_id"?: string | null,"location_label": string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"floor_id"?: string | null,"location_label"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tender_boq_location_map_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "project_floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tender_boq_location_map_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"variations": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"committed_amount": number | null,"created_at": string,"description": string,"id": string,"is_approved": boolean,"project_id": string,"raised_at": string,"raised_by": string,"request_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"committed_amount"?: number | null,"created_at"?: string,"description": string,"id"?: string,"is_approved"?: boolean,"project_id": string,"raised_at"?: string,"raised_by": string,"request_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"committed_amount"?: number | null,"created_at"?: string,"description"?: string,"id"?: string,"is_approved"?: boolean,"project_id"?: string,"raised_at"?: string,"raised_by"?: string,"request_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "variations_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assign_project_pic":
{ Args: { "p_new_pic_id": string,"p_project_id": string }; Returns: undefined
                           },
"can_view_project":
{ Args: { "p_client_id": string,"p_is_maintenance": boolean }; Returns: boolean
                           },
"commit_boq_import":
{ Args: { "p_floors": Json,"p_lines": Json,"p_project_id": string,"p_systems": Json,"p_tier": string }; Returns: Json
                           },
"compute_project_rollup_percent":
{ Args: { "p_project_id": string }; Returns: number
                           },
"current_team":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_user_profiles":
{ Args: { "p_ids": (string)[] }; Returns: {
              "full_name": string,"id": string,"telegram_chat_id": string,"telegram_linked_at": string,"telegram_username": string,"username": string
            }[]
                           },
"is_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_sales_only_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_superadmin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"list_unlinked_accounts":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"email": string,"user_id": string
            }[]
                           },
"next_material_approval_ref":
{ Args: { "p_project_id": string }; Returns: string
                           },
"project_effective_start_date":
{ Args: { "p_project_id": string }; Returns: string
                           },
"recalculate_project_rollup":
{ Args: { "p_project_id": string }; Returns: undefined
                           },
"record_shop_drawing_check":
{ Args: { "p_item_id": string }; Returns: {
              "checked_at": string,
"checked_by": string,
"created_at": string,
"id": string,
"item_id": string,
"revision": number
            }
                          SetofOptions: {
        from: "*"
        to: "shop_drawing_checks"
        isOneToOne: true
        isSetofReturn: false
      } },
"seed_progress_cells":
{ Args: { "p_floor_id": string,"p_project_system_id": string }; Returns: undefined
                           },
"set_project_cad_identity":
{ Args: { "p_cad_consultant_name": string,"p_cad_owner_name": string,"p_drawing_numbering_mode": string,"p_project_id": string }; Returns: undefined
                           },
"set_project_dates":
{ Args: { "p_project_id": string,"p_start_date": string,"p_target_date": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "workflow": {
          Enums: {
            
          }
        }
} as const

