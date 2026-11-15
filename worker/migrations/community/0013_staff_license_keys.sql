UPDATE website_role_permissions
SET permissions = json_insert(permissions, '$[#]', 'licenses.keys')
WHERE role_id IN ('support_team', 'developer', 'studio_lead', 'owner')
AND EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'dashboard.view')
AND EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'customers.view')
AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'licenses.keys');
