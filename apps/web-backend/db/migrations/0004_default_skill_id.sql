UPDATE tenant_skills AS legacy
SET skill_id = 'default'
WHERE legacy.skill_id = 'acme-onboarding'
  AND NOT EXISTS (
    SELECT 1
    FROM tenant_skills AS current
    WHERE current.tenant_id = legacy.tenant_id
      AND current.skill_id = 'default'
  );
--> statement-breakpoint
DELETE FROM tenant_skills AS legacy
WHERE legacy.skill_id = 'acme-onboarding'
  AND EXISTS (
    SELECT 1
    FROM tenant_skills AS current
    WHERE current.tenant_id = legacy.tenant_id
      AND current.skill_id = 'default'
  );
