UPDATE mission_definitions
SET rules_json='{"prerequisite":"learning_complete","category":"explore","day":3}'
WHERE id='journey-03';

UPDATE mission_definitions
SET rules_json='{"prerequisite":"quiz_passed","category":"explore","day":15}'
WHERE id='journey-15';

UPDATE mission_definitions
SET rules_json='{"prerequisite":"journey_review","category":"reflect","day":29}'
WHERE id='journey-29';
