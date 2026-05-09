-- BuildTrack Seed Data (Development Only)
-- Run after schema.sql: psql -d buildtrack -f sql/seed.sql

-- Only seed if no users exist
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM users) > 0 THEN
    RAISE NOTICE 'Database already seeded. Skipping.';
    RETURN;
  END IF;

  -- Insert demo user
  INSERT INTO users (id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
  VALUES (
    gen_random_uuid(),
    'demo@buildtrack.com',
    '$2a$12$N9qo8uLOickgx2ZMRZoMy.MqrqI2gY6R5b5y3x5p3Y5p3Y5p3Y5p3',  -- bcrypt hash of 'demo1234'
    'Demo',
    'User',
    'admin',
    'BuildTrack Demo Corp',
    'pro',
    'active'
  );

  -- Get the demo user ID
  DECLARE
    demo_user_id UUID;
  BEGIN
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@buildtrack.com';

    -- Insert demo projects
    INSERT INTO projects (id, user_id, name, description, location, budget, progress, status, start_date, end_date)
    VALUES
      (gen_random_uuid(), demo_user_id, 'Downtown Office Complex', 'Construction of a 12-story office building', '123 Main St, Downtown', 2500000, 45, 'active', '2024-01-15', '2025-06-30'),
      (gen_random_uuid(), demo_user_id, 'Riverfront Apartments', 'Luxury waterfront residential complex', '456 River Rd, Waterfront', 1800000, 20, 'planning', '2024-06-01', '2025-12-31'),
      (gen_random_uuid(), demo_user_id, 'Highway Bridge Repair', 'Structural reinforcement of Bridge 42', 'I-95, Mile Marker 127', 950000, 75, 'active', '2023-09-01', '2025-03-15');

    -- Get project IDs
    DECLARE
      p1 UUID; p2 UUID; p3 UUID;
    BEGIN
      SELECT id INTO p1 FROM projects WHERE name = 'Downtown Office Complex';
      SELECT id INTO p2 FROM projects WHERE name = 'Riverfront Apartments';
      SELECT id INTO p3 FROM projects WHERE name = 'Highway Bridge Repair';

      -- Insert demo tasks for project 1
      INSERT INTO tasks (id, project_id, title, description, priority, status, due_date)
      VALUES
        (gen_random_uuid(), p1, 'Foundation excavation', 'Excavate and prepare foundation site', 'high', 'completed', NOW() + INTERVAL '10 days'),
        (gen_random_uuid(), p1, 'Pour concrete foundation', 'Pour reinforced concrete foundation', 'high', 'in-progress', NOW() + INTERVAL '30 days'),
        (gen_random_uuid(), p1, 'Install steel frame', 'Erect structural steel framework', 'medium', 'pending', NOW() + INTERVAL '60 days'),
        (gen_random_uuid(), p1, 'Electrical rough-in', 'Install electrical conduits and boxes', 'medium', 'pending', NOW() + INTERVAL '90 days'),
        (gen_random_uuid(), p1, 'Plumbing installation', 'Install main plumbing lines', 'low', 'pending', NOW() + INTERVAL '120 days');

      -- Insert demo workers
      INSERT INTO workers (id, user_id, name, role, status, phone, email, hourly_rate, weekly_hours)
      VALUES
        (gen_random_uuid(), demo_user_id, 'John Smith', 'foreman', 'active', '555-0101', 'john@example.com', 45.00, 45),
        (gen_random_uuid(), demo_user_id, 'Mike Johnson', 'electrician', 'active', '555-0102', 'mike@example.com', 38.50, 40),
        (gen_random_uuid(), demo_user_id, 'Sarah Williams', 'plumber', 'active', '555-0103', 'sarah@example.com', 40.00, 40),
        (gen_random_uuid(), demo_user_id, 'David Brown', 'carpenter', 'off-duty', '555-0104', 'david@example.com', 35.00, 35),
        (gen_random_uuid(), demo_user_id, 'Lisa Davis', 'engineer', 'active', '555-0105', 'lisa@example.com', 55.00, 40),
        (gen_random_uuid(), demo_user_id, 'Robert Wilson', 'safety-officer', 'active', '555-0106', 'robert@example.com', 42.00, 40);

      -- Assign workers to project 1
      INSERT INTO project_workers (project_id, worker_id)
      SELECT p1, w.id FROM workers w WHERE w.user_id = demo_user_id;

      -- Insert demo safety incident
      INSERT INTO safety_incidents (id, project_id, reported_by, title, description, severity, date, injuries, witnesses, status)
      VALUES (
        gen_random_uuid(), p1, demo_user_id,
        'Minor scaffolding incident',
        'Scaffolding plank shifted during morning inspection. No injuries. Immediate corrective action taken.',
        'low',
        NOW() - INTERVAL '5 days',
        0,
        '["Tom Baker", "Jane Miller"]',
        'resolved'
      );

      -- Insert demo inspection
      INSERT INTO inspections (id, project_id, title, inspector_name, description, status, date, findings)
      VALUES (
        gen_random_uuid(), p1,
        'Foundation pour inspection',
        'James Peterson, PE',
        'Rebar placement and concrete mix verification',
        'passed',
        NOW() - INTERVAL '10 days',
        '["Rebar spacing verified at 16 inches", "Concrete slump test passed", "Anchor bolt placement approved"]'
      );

      -- Insert demo notifications
      INSERT INTO notifications (id, user_id, title, body, type, related_id, read)
      VALUES
        (gen_random_uuid(), demo_user_id, 'Foundation inspection passed', 'Foundation pour inspection passed with no issues.', 'project', p1, false),
        (gen_random_uuid(), demo_user_id, 'New task assigned', 'You have been assigned to Electrical rough-in task.', 'task', p1, false),
        (gen_random_uuid(), demo_user_id, 'Safety incident resolved', 'Scaffolding incident has been resolved.', 'safety', p1, true);

      -- Insert activity logs
      INSERT INTO activity_logs (id, user_id, project_id, action, entity_type, entity_id, metadata)
      VALUES
        (gen_random_uuid(), demo_user_id, p1, 'created', 'project', p1, '{"name": "Downtown Office Complex"}'::jsonb),
        (gen_random_uuid(), demo_user_id, p1, 'created', 'task', (SELECT id FROM tasks WHERE title = 'Foundation excavation'), '{"title": "Foundation excavation"}'::jsonb),
        (gen_random_uuid(), demo_user_id, p1, 'inspection_passed', 'inspection', (SELECT id FROM inspections WHERE title = 'Foundation pour inspection'), '{"inspector": "James Peterson, PE"}'::jsonb);
    END;
  END;
END $$;

RAISE NOTICE 'BuildTrack seed data loaded successfully.';
