-- Preserve existing role policies while enabling the previously unrestricted member actions.
UPDATE website_role_permissions
SET permissions = json_insert(permissions, '$[#]', 'support.create', '$[#]', 'trials.request', '$[#]', 'forum.post'),
    revision = revision + 1;
UPDATE website_role_permissions
SET permissions = json_insert(permissions, '$[#]', 'staff.docs')
WHERE role_id IN ('support_team', 'developer', 'studio_lead', 'owner');
