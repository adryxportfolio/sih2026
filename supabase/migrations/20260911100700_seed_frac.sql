-- =============================================================================
--  SAMIKSHA · 0008 · FRAC Seed — India's Official Statistical System
--
--  Competency taxonomy grounded in:
--    · Mission Karmayogi FRAC (behavioural / functional / domain split)
--    · MoSPI Capacity Development scheme & NSSTA training curricula
--    · Statistical Quality Assurance Framework (SQAF)
--    · National Metadata Structure (NMDS 2.0)
--    · UN Generic Statistician Competency Framework
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  ORGANIZATIONS
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.organizations (name, short_name, org_type, state_code) values
  ('Ministry of Statistics and Programme Implementation', 'MoSPI', 'ministry', null),
  ('National Statistical Office',                          'NSO',   'department', null),
  ('National Statistical Systems Training Academy',         'NSSTA', 'training_institute', null),
  ('Directorate of Economics and Statistics, Maharashtra',  'DES-MH','state_directorate', 'MH'),
  ('Directorate of Economics and Statistics, Tamil Nadu',   'DES-TN','state_directorate', 'TN'),
  ('Directorate of Economics and Statistics, West Bengal',  'DES-WB','state_directorate', 'WB')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  COMPETENCIES
--  level_descriptors make each rung observable rather than vague — this is
--  what lets the AI assess against a rubric instead of a vibe.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.competencies (code, name, comp_type, category, description, level_descriptors, sort_order) values

-- ── BEHAVIOURAL ─────────────────────────────────────────────────────────────
('BEH-COM-01','Communication','behavioural','Personal Effectiveness',
 'Conveys statistical findings clearly to technical and non-technical audiences, in writing and speech.',
 '{"beginner":"Writes clear factual notes and emails.","practitioner":"Explains survey results to non-specialists without distortion.","proficient":"Drafts press notes and briefs senior officers on complex releases.","expert":"Represents the department publicly and handles contested statistical questions."}'::jsonb, 10),

('BEH-COL-01','Collaboration and Teamwork','behavioural','Personal Effectiveness',
 'Works effectively across divisions, states and partner agencies to deliver statistical outputs.',
 '{"beginner":"Contributes reliably to a team task.","practitioner":"Coordinates with field staff and other divisions.","proficient":"Leads cross-divisional data initiatives.","expert":"Builds inter-ministerial and centre-state statistical partnerships."}'::jsonb, 20),

('BEH-DEC-01','Decision Making','behavioural','Leadership',
 'Makes sound, evidence-based decisions under uncertainty and time pressure.',
 '{"beginner":"Follows defined decision rules.","practitioner":"Weighs trade-offs in survey operations.","proficient":"Decides on methodology changes with documented justification.","expert":"Sets departmental policy on contested methodological questions."}'::jsonb, 30),

('BEH-INT-01','Integrity and Statistical Ethics','behavioural','Ethos',
 'Upholds professional independence, impartiality and confidentiality in official statistics.',
 '{"beginner":"Knows the confidentiality obligations under the Collection of Statistics Act.","practitioner":"Applies disclosure rules correctly in routine work.","proficient":"Identifies and resists pressure that would compromise impartiality.","expert":"Sets and enforces the ethical framework for the organisation."}'::jsonb, 40),

('BEH-RES-01','Result Orientation','behavioural','Personal Effectiveness',
 'Delivers statistical outputs on schedule and to required quality.',
 '{"beginner":"Completes assigned tasks on time.","practitioner":"Manages own workload against release calendars.","proficient":"Owns delivery of a recurring statistical product.","expert":"Drives timeliness reform across multiple products."}'::jsonb, 50),

('BEH-PPL-01','People Management','behavioural','Leadership',
 'Builds, motivates and develops statistical teams including field staff.',
 '{"beginner":"Supports colleagues on shared tasks.","practitioner":"Supervises a small field or processing team.","proficient":"Manages performance and development of a unit.","expert":"Shapes cadre-wide capability strategy."}'::jsonb, 60),

-- ── FUNCTIONAL ──────────────────────────────────────────────────────────────
('FUN-SAMP-01','Sampling Design and Estimation','functional','Statistical Methods',
 'Designs probability samples and constructs valid estimators with measures of precision.',
 '{"beginner":"Explains SRS and the idea of a sampling frame.","practitioner":"Implements stratified and multi-stage designs; computes design weights.","proficient":"Designs complex rotational panels; derives variance estimators for multi-stage designs.","expert":"Advises on national sample design and reviews methodology for major surveys."}'::jsonb, 100),

('FUN-QUES-01','Questionnaire and Instrument Design','functional','Statistical Methods',
 'Designs schedules and CAPI instruments that minimise measurement and response error.',
 '{"beginner":"Understands question wording pitfalls.","practitioner":"Drafts and pre-tests schedules with skip logic.","proficient":"Designs CAPI instruments with embedded validations.","expert":"Sets instrument design standards across surveys."}'::jsonb, 110),

('FUN-COLL-01','Data Collection and Field Operations','functional','Operations',
 'Plans and supervises field enumeration, including training, logistics and non-response follow-up.',
 '{"beginner":"Conducts enumeration per the manual.","practitioner":"Supervises enumerators and resolves field issues.","proficient":"Plans district-level field operations and manages non-response.","expert":"Designs national field operations and quality control protocols."}'::jsonb, 120),

('FUN-CLEAN-01','Data Cleaning, Editing and Imputation','functional','Data Processing',
 'Detects and treats errors, outliers and missing values using defensible, documented methods.',
 '{"beginner":"Runs prescribed validation checks.","practitioner":"Designs edit rules and applies standard imputation.","proficient":"Selects and evaluates imputation strategies; quantifies their impact.","expert":"Defines organisation-wide editing and imputation policy."}'::jsonb, 130),

('FUN-ANAL-01','Statistical Analysis and Inference','functional','Statistical Methods',
 'Applies inferential and modelling techniques correctly, respecting the survey design.',
 '{"beginner":"Computes descriptive statistics correctly.","practitioner":"Runs design-based estimation and hypothesis tests.","proficient":"Builds regression and time-series models with correct standard errors.","expert":"Develops new analytical methodology for official statistics."}'::jsonb, 140),

('FUN-VIZ-01','Data Visualisation and Statistical Storytelling','functional','Communication',
 'Presents statistical results in visual forms that are accurate, accessible and not misleading.',
 '{"beginner":"Produces correct basic charts.","practitioner":"Chooses appropriate chart types and annotates uncertainty.","proficient":"Builds dashboards and designs release graphics.","expert":"Sets visual standards for national data products."}'::jsonb, 150),

('FUN-QUAL-01','Statistical Quality Assurance (SQAF)','functional','Data Governance',
 'Applies the Statistical Quality Assurance Framework across the statistical production cycle.',
 '{"beginner":"Knows the SQAF quality dimensions.","practitioner":"Applies SQAF checks to a product.","proficient":"Conducts quality assessments and drives remediation.","expert":"Leads national quality assessment and certification."}'::jsonb, 160),

('FUN-META-01','Metadata and Statistical Standards (NMDS 2.0)','functional','Data Governance',
 'Documents data using the National Metadata Structure and standard classifications (NIC, NCO, COICOP).',
 '{"beginner":"Records basic metadata fields.","practitioner":"Applies NMDS 2.0 and standard classifications correctly.","proficient":"Designs metadata workflows and harmonises across products.","expert":"Contributes to national and international standard-setting."}'::jsonb, 170),

('FUN-DISS-01','Data Dissemination and Access','functional','Data Governance',
 'Publishes statistics through catalogues and APIs so they are findable and usable.',
 '{"beginner":"Publishes tables per template.","practitioner":"Manages release calendars and catalogue entries.","proficient":"Designs microdata access and API-based dissemination.","expert":"Sets national open-data and dissemination policy."}'::jsonb, 180),

('FUN-TOOL-01','Statistical Computing','functional','Digital Skills',
 'Uses R, Python, SPSS or STATA for reproducible statistical production.',
 '{"beginner":"Runs existing scripts.","practitioner":"Writes scripts for tabulation and estimation.","proficient":"Builds reproducible, version-controlled pipelines.","expert":"Architects the organisation''s analytical computing stack."}'::jsonb, 190),

('FUN-BIGD-01','Big Data and Alternative Data Sources','functional','Emerging Methods',
 'Evaluates administrative, scanner, satellite and web data for official statistics.',
 '{"beginner":"Aware of alternative data source types.","practitioner":"Links administrative data to survey frames.","proficient":"Assesses fitness-for-use and integrates alternative sources.","expert":"Leads modernisation using non-traditional data."}'::jsonb, 200),

('FUN-CONF-01','Confidentiality and Disclosure Control','functional','Data Governance',
 'Protects respondent identity through statistical disclosure control.',
 '{"beginner":"Knows legal confidentiality duties.","practitioner":"Applies suppression and aggregation rules.","proficient":"Implements SDC methods for microdata release.","expert":"Defines national disclosure control policy."}'::jsonb, 210),

-- ── DOMAIN ──────────────────────────────────────────────────────────────────
('DOM-NAS-01','National Accounts Statistics','domain','Macro Statistics',
 'Compiles GDP, GVA and related aggregates per the SNA framework.',
 '{"beginner":"Understands GDP vs GVA.","practitioner":"Compiles sectoral estimates from source data.","proficient":"Handles base-year revision and deflation.","expert":"Leads national accounts methodology."}'::jsonb, 300),

('DOM-PRICE-01','Price Statistics (CPI and WPI)','domain','Macro Statistics',
 'Constructs and maintains consumer and wholesale price indices.',
 '{"beginner":"Understands index number basics.","practitioner":"Compiles CPI from collected price data.","proficient":"Manages weight revision and item substitution.","expert":"Leads price index methodology reform."}'::jsonb, 310),

('DOM-IND-01','Industrial Statistics (ASI and IIP)','domain','Sectoral Statistics',
 'Conducts the Annual Survey of Industries and compiles the Index of Industrial Production.',
 '{"beginner":"Knows ASI scope and coverage.","practitioner":"Processes ASI returns and compiles IIP.","proficient":"Manages frame maintenance and base revision.","expert":"Leads industrial statistics methodology."}'::jsonb, 320),

('DOM-AGRI-01','Agricultural Statistics','domain','Sectoral Statistics',
 'Produces crop area, yield and production estimates including crop-cutting experiments.',
 '{"beginner":"Understands area-yield-production identity.","practitioner":"Supervises crop-cutting experiments.","proficient":"Designs state-level agricultural estimation.","expert":"Leads national agricultural statistics reform."}'::jsonb, 330),

('DOM-SOC-01','Social and Demographic Statistics','domain','Social Statistics',
 'Produces employment, consumption, health and education statistics (PLFS, HCES).',
 '{"beginner":"Knows PLFS and HCES scope.","practitioner":"Computes standard labour and consumption indicators.","proficient":"Analyses distributional and poverty measures.","expert":"Leads social statistics methodology."}'::jsonb, 340),

('DOM-NSS-01','NSS Survey Methodology','domain','Survey Systems',
 'Applies National Sample Survey design, schedules and estimation procedures.',
 '{"beginner":"Knows NSS round structure.","practitioner":"Applies NSS schedules and multipliers.","proficient":"Designs NSS sub-samples and validates estimates.","expert":"Shapes NSS round design."}'::jsonb, 350),

('DOM-SDG-01','SDG Indicator Framework','domain','Monitoring',
 'Maps, compiles and reports National Indicator Framework indicators for the SDGs.',
 '{"beginner":"Knows the NIF structure.","practitioner":"Compiles assigned SDG indicators.","proficient":"Resolves data gaps and metadata for SDG reporting.","expert":"Leads national SDG statistical reporting."}'::jsonb, 360),

('DOM-ENV-01','Environment and Climate Statistics','domain','Emerging Domains',
 'Compiles environment accounts and climate-related statistics (FDES / SEEA).',
 '{"beginner":"Aware of FDES structure.","practitioner":"Compiles basic environment statistics.","proficient":"Builds SEEA-aligned accounts.","expert":"Leads environmental-economic accounting."}'::jsonb, 370)

on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  JOB ROLES
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.job_roles (code, name, grade_level, description) values
  ('FI',  'Field Investigator',                    'Group C',
   'Conducts household and establishment enumeration for national surveys.'),
  ('JSO', 'Junior Statistical Officer',            'Group B',
   'Compiles and validates statistical returns; supervises field enumeration.'),
  ('SSO', 'Senior Statistical Officer',            'Group B',
   'Leads tabulation, estimation and quality checks for statistical products.'),
  ('ASD', 'Assistant Director (Statistics)',       'Group A',
   'Manages a statistical product end to end including methodology decisions.'),
  ('DD',  'Deputy Director (NSO)',                 'Group A',
   'Oversees survey design, estimation and release for a statistical division.'),
  ('DIR', 'Director (Statistics)',                 'Group A',
   'Sets divisional statistical policy, quality standards and dissemination strategy.')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  ROLE ⇄ COMPETENCY REQUIREMENTS
--  The proficiency bar rises with seniority — this is what gap analysis
--  measures every learner against.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  m record;
begin
  for m in
    select * from (values
      -- role, competency, required_level, weight, critical
      ('FI','BEH-COM-01','beginner',1.0,false),
      ('FI','BEH-INT-01','practitioner',2.0,true),
      ('FI','FUN-COLL-01','practitioner',2.5,true),
      ('FI','FUN-QUES-01','beginner',1.0,false),
      ('FI','FUN-CONF-01','beginner',1.5,true),
      ('FI','DOM-NSS-01','beginner',1.5,false),

      ('JSO','BEH-COM-01','practitioner',1.5,false),
      ('JSO','BEH-RES-01','practitioner',1.0,false),
      ('JSO','BEH-INT-01','practitioner',2.0,true),
      ('JSO','FUN-SAMP-01','beginner',2.0,true),
      ('JSO','FUN-COLL-01','proficient',2.0,true),
      ('JSO','FUN-CLEAN-01','practitioner',2.0,true),
      ('JSO','FUN-TOOL-01','beginner',1.5,false),
      ('JSO','FUN-META-01','beginner',1.5,false),
      ('JSO','FUN-CONF-01','practitioner',1.5,true),
      ('JSO','DOM-NSS-01','practitioner',2.0,false),

      ('SSO','BEH-COM-01','proficient',1.5,false),
      ('SSO','BEH-DEC-01','practitioner',1.5,false),
      ('SSO','BEH-INT-01','proficient',2.0,true),
      ('SSO','FUN-SAMP-01','practitioner',2.5,true),
      ('SSO','FUN-CLEAN-01','proficient',2.0,true),
      ('SSO','FUN-ANAL-01','practitioner',2.5,true),
      ('SSO','FUN-QUAL-01','practitioner',2.0,true),
      ('SSO','FUN-TOOL-01','practitioner',2.0,false),
      ('SSO','FUN-VIZ-01','practitioner',1.5,false),
      ('SSO','FUN-META-01','practitioner',1.5,false),
      ('SSO','DOM-NSS-01','proficient',2.0,false),

      ('ASD','BEH-COM-01','proficient',2.0,false),
      ('ASD','BEH-DEC-01','proficient',2.0,true),
      ('ASD','BEH-PPL-01','practitioner',1.5,false),
      ('ASD','BEH-INT-01','proficient',2.0,true),
      ('ASD','FUN-SAMP-01','proficient',2.5,true),
      ('ASD','FUN-ANAL-01','proficient',2.5,true),
      ('ASD','FUN-QUAL-01','proficient',2.5,true),
      ('ASD','FUN-META-01','proficient',2.0,true),
      ('ASD','FUN-DISS-01','practitioner',1.5,false),
      ('ASD','FUN-TOOL-01','proficient',2.0,false),
      ('ASD','FUN-BIGD-01','practitioner',1.5,false),
      ('ASD','DOM-SOC-01','proficient',2.0,false),

      ('DD','BEH-DEC-01','expert',2.5,true),
      ('DD','BEH-PPL-01','proficient',2.0,true),
      ('DD','BEH-COL-01','proficient',1.5,false),
      ('DD','BEH-INT-01','expert',2.5,true),
      ('DD','FUN-SAMP-01','expert',3.0,true),
      ('DD','FUN-ANAL-01','proficient',2.5,true),
      ('DD','FUN-QUAL-01','expert',2.5,true),
      ('DD','FUN-CONF-01','proficient',2.0,true),
      ('DD','FUN-BIGD-01','proficient',2.0,false),
      ('DD','DOM-NAS-01','proficient',2.0,false),
      ('DD','DOM-SDG-01','practitioner',1.5,false),

      ('DIR','BEH-DEC-01','expert',3.0,true),
      ('DIR','BEH-PPL-01','expert',2.5,true),
      ('DIR','BEH-COL-01','expert',2.0,true),
      ('DIR','BEH-INT-01','expert',3.0,true),
      ('DIR','FUN-QUAL-01','expert',3.0,true),
      ('DIR','FUN-DISS-01','expert',2.5,true),
      ('DIR','FUN-META-01','expert',2.0,true),
      ('DIR','FUN-BIGD-01','proficient',2.0,false),
      ('DIR','DOM-NAS-01','expert',2.5,false),
      ('DIR','DOM-SDG-01','proficient',2.0,false)
    ) as t(role_code, comp_code, req_level, wt, crit)
  loop
    insert into public.role_competencies (job_role_id, competency_id, required_level, weight, is_critical)
    select jr.id, c.id, m.req_level::public.proficiency_level, m.wt, m.crit
    from public.job_roles jr, public.competencies c
    where jr.code = m.role_code and c.code = m.comp_code
    on conflict (job_role_id, competency_id) do nothing;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  ACHIEVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.achievements (id, title, description, icon, tier, xp_reward) values
  ('first_steps',    'First Steps',        'Completed your very first study session.',            'footsteps',    'bronze',   50),
  ('streak_3',       'Building Momentum',  'Met your daily goal 3 days in a row.',                'flame',        'bronze',  100),
  ('streak_7',       'Week Warrior',       'Met your daily goal 7 days in a row.',                'flame',        'silver',  250),
  ('streak_30',      'Unstoppable',        'Met your daily goal 30 days in a row.',               'flame',        'gold',   1000),
  ('cards_100',      'Century of Recall',  'Reviewed 100 flashcards.',                            'layers',       'bronze',  150),
  ('cards_1000',     'Memory Architect',   'Reviewed 1,000 flashcards.',                          'layers',       'gold',   1200),
  ('quiz_perfect',   'Flawless',           'Scored 100% on a quiz of 10 or more questions.',      'checkmark',    'silver',  300),
  ('well_calibrated','Know What You Know', 'Finished a quiz with calibration error under 0.15.',  'compass',      'gold',    500),
  ('gap_closed',     'Gap Closer',         'Raised a competency to its required proficiency.',    'trending-up',  'gold',    750),
  ('first_upload',   'Bring Your Own',     'Generated a quiz from your own uploaded material.',   'cloud-upload', 'bronze',  100),
  ('path_complete',  'Path Finisher',      'Completed an entire personalised learning path.',     'trophy',       'platinum',2000),
  ('polyglot',       'In Your Language',   'Studied in more than one language.',                  'language',     'silver',  200)
on conflict (id) do nothing;
