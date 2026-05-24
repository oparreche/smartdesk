-- AlterTable
ALTER TABLE `ticket_events` MODIFY `type` ENUM('created', 'status_changed', 'priority_changed', 'assignee_changed', 'queue_changed', 'tag_added', 'tag_removed', 'message_added', 'enrichment_completed', 'enrichment_failed', 'rule_applied', 'sla_breached', 'custom_field_changed', 'csat_received') NOT NULL;
