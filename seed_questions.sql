INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'A customer is unhappy with the service. What is your FIRST step?',
       '[{"text": "Listen actively and acknowledge their concern", "isCorrect": true}, {"text": "Explain why the service was correct", "isCorrect": false}, {"text": "Offer a discount immediately", "isCorrect": false}, {"text": "Ask them to contact support", "isCorrect": false}]'::jsonb,
       'Active listening shows respect and helps de-escalate the situation before finding a solution.', 0
FROM training_modules WHERE title = 'Customer Service Excellence' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'You arrive 15 minutes late due to traffic. What should you do?',
       '[{"text": "Apologize sincerely and explain briefly", "isCorrect": true}, {"text": "Start working without mentioning it", "isCorrect": false}, {"text": "Blame the traffic and say it is not your fault", "isCorrect": false}, {"text": "Ask the customer to reschedule", "isCorrect": false}]'::jsonb,
       'Acknowledging the delay shows professionalism and respect for the customer time.', 1
FROM training_modules WHERE title = 'Customer Service Excellence' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'A customer asks for a service you are not certified for. What do you do?',
       '[{"text": "Politely decline and suggest they book the correct service", "isCorrect": true}, {"text": "Attempt it anyway since you have similar experience", "isCorrect": false}, {"text": "Say yes and figure it out on the job", "isCorrect": false}, {"text": "Tell them to do it themselves", "isCorrect": false}]'::jsonb,
       'Working outside your certification risks safety and quality. Always refer to the right specialist.', 2
FROM training_modules WHERE title = 'Customer Service Excellence' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'Before starting any job, what should you check FIRST?',
       '[{"text": "That you have the correct PPE for the task", "isCorrect": true}, {"text": "That the customer has paid", "isCorrect": false}, {"text": "That your tools are sharp", "isCorrect": false}, {"text": "That the weather is good", "isCorrect": false}]'::jsonb,
       'PPE is your first line of defense against injury. Always verify you have the right gear.', 0
FROM training_modules WHERE title = 'Workplace Safety Basics' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'You notice a damaged power cord on a tool. What do you do?',
       '[{"text": "Stop using it and report it for repair/replacement", "isCorrect": true}, {"text": "Wrap it with tape and continue", "isCorrect": false}, {"text": "Use it carefully avoiding the damaged part", "isCorrect": false}, {"text": "Finish the job quickly then report", "isCorrect": false}]'::jsonb,
       'Damaged electrical equipment is a shock and fire hazard. Never use it.', 1
FROM training_modules WHERE title = 'Workplace Safety Basics' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'When lifting heavy objects, what is the correct technique?',
       '[{"text": "Bend knees, keep back straight, hold load close to body", "isCorrect": true}, {"text": "Bend at waist, use back muscles", "isCorrect": false}, {"text": "Twist while lifting to position the load", "isCorrect": false}, {"text": "Lift with arms fully extended", "isCorrect": false}]'::jsonb,
       'Proper lifting technique protects your back from serious injury.', 2
FROM training_modules WHERE title = 'Workplace Safety Basics' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'A customer wants to pay via UPI. What should you verify FIRST?',
       '[{"text": "The UPI ID matches the customer name", "isCorrect": true}, {"text": "The amount is correct", "isCorrect": false}, {"text": "The transaction ID is generated", "isCorrect": false}, {"text": "The customer has internet", "isCorrect": false}]'::jsonb,
       'Always verify the payee name matches to prevent fraud.', 0
FROM training_modules WHERE title = 'Digital Payment Handling' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'After completing a job, what should you do with your tools?',
       '[{"text": "Clean, inspect, and store them properly", "isCorrect": true}, {"text": "Leave them in the toolbox until next job", "isCorrect": false}, {"text": "Wipe them on your clothes", "isCorrect": false}, {"text": "Give them to the customer", "isCorrect": false}]'::jsonb,
       'Proper tool care extends life and ensures safety for the next job.', 0
FROM training_modules WHERE title = 'Tool Maintenance & Care' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO training_questions (module_id, text, options, explanation, order_index)
SELECT id, 'A colleague gets a minor cut. What is the FIRST step?',
       '[{"text": "Apply pressure with clean cloth and elevate", "isCorrect": true}, {"text": "Ignore it and keep working", "isCorrect": false}, {"text": "Apply coffee powder", "isCorrect": false}, {"text": "Run to the hospital immediately", "isCorrect": false}]'::jsonb,
       'Direct pressure stops bleeding. Elevate the wound if possible.', 0
FROM training_modules WHERE title = 'First Aid Awareness' LIMIT 1
ON CONFLICT DO NOTHING;