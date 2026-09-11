-- =============================================================================
--  SAMIKSHA · 0010 · Technical & Digital Governance Competencies
--
--  SIH26101 targets officials whose skill requirements are shifting toward
--  AI/ML, Python/R, GIS, cloud and big-data methods. Modelling only statistical
--  craft and behaviour would miss the half of the problem the Ministry is
--  actually worried about — an officer can be an excellent sampling
--  statistician and still be unable to query the database their data sits in.
--
--  Two families added:
--    TECHNICAL           the tooling the modern statistical workflow runs on
--    DIGITAL_GOVERNANCE  the obligations that come with handling citizen data
--
--  Safe to run against a database created before the enum was widened.
-- =============================================================================

-- Idempotent for databases provisioned from the earlier 3-value enum.
alter type public.competency_type add value if not exists 'technical';
alter type public.competency_type add value if not exists 'digital_governance';

-- Reclassify: this was always a technical skill sitting in the wrong family.
update public.competencies
   set comp_type = 'technical',
       name = 'Reproducible Statistical Computing',
       description = 'Builds auditable, version-controlled analytical pipelines rather than one-off spreadsheets.'
 where code = 'FUN-TOOL-01';

-- ─────────────────────────────────────────────────────────────────────────────
--  TECHNICAL
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.competencies (code, name, comp_type, category, description, level_descriptors, sort_order) values

('TEC-PY-01','Python for Data Analysis','technical','Programming',
 'Uses Python (pandas, numpy, statsmodels) for data preparation, estimation and automation of statistical production.',
 '{"beginner":"Reads and runs an existing script; understands variables and loops.","practitioner":"Writes pandas pipelines to clean and tabulate survey data independently.","proficient":"Builds survey-weighted estimation in Python with correct standard errors; writes reusable modules.","expert":"Architects the division''s Python stack and sets code review standards."}'::jsonb, 400),

('TEC-R-01','R for Statistical Analysis','technical','Programming',
 'Uses R and the survey package for design-based estimation and statistical modelling.',
 '{"beginner":"Runs prepared R scripts and reads output.","practitioner":"Uses dplyr and the survey package for weighted tabulation.","proficient":"Specifies complex survey designs in svydesign() and validates against published multipliers.","expert":"Authors internal R packages for the organisation''s recurring estimation tasks."}'::jsonb, 410),

('TEC-SQL-01','SQL and Database Querying','technical','Data Engineering',
 'Retrieves and joins data from relational stores without depending on someone else to extract it.',
 '{"beginner":"Writes SELECT with WHERE and ORDER BY.","practitioner":"Joins across tables, aggregates with GROUP BY, understands NULL semantics.","proficient":"Writes window functions and CTEs; reasons about query cost on large tables.","expert":"Designs the schema and access patterns for a statistical data warehouse."}'::jsonb, 420),

('TEC-GIS-01','Geospatial Analysis and GIS','technical','Spatial Methods',
 'Uses QGIS/ArcGIS and spatial data for mapping, small-area estimation and frame construction.',
 '{"beginner":"Opens a shapefile and produces a basic choropleth.","practitioner":"Joins statistical tables to boundary files and produces correct district maps.","proficient":"Performs spatial joins and area-weighted apportionment for small-area estimates.","expert":"Leads geospatial integration of the statistical frame."}'::jsonb, 430),

('TEC-ML-01','Machine Learning for Official Statistics','technical','Emerging Methods',
 'Applies and critically evaluates ML where it genuinely improves official statistics — imputation, coding, nowcasting.',
 '{"beginner":"Distinguishes supervised from unsupervised learning; knows overfitting exists.","practitioner":"Trains and validates a classifier for automatic NIC/NCO code assignment.","proficient":"Evaluates model bias and explains why a black-box model may be unacceptable for an official release.","expert":"Sets policy on where ML is and is not admissible in statistical production."}'::jsonb, 440),

('TEC-VIZ-01','Dashboards and Business Intelligence','technical','Dissemination Tech',
 'Builds interactive dashboards (Power BI, Superset, Tableau) over statistical outputs.',
 '{"beginner":"Navigates an existing dashboard and exports a view.","practitioner":"Builds a dashboard from a clean dataset with correct filters.","proficient":"Designs performant data models behind a dashboard and handles disclosure limits.","expert":"Defines the organisation''s BI architecture and governance."}'::jsonb, 450),

('TEC-API-01','APIs and Data Interoperability','technical','Data Engineering',
 'Consumes and publishes data through APIs and standard exchange formats (SDMX, JSON, CSV-W).',
 '{"beginner":"Understands what an API endpoint returns.","practitioner":"Calls a REST API and parses the response into a usable table.","proficient":"Designs an SDMX-compliant dissemination API for a statistical product.","expert":"Sets interoperability standards across the statistical system."}'::jsonb, 460),

('TEC-CLOUD-01','Cloud and Scalable Computing','technical','Infrastructure',
 'Uses government cloud (MeghRaj) and scalable compute for large statistical workloads.',
 '{"beginner":"Knows what cloud storage and compute are.","practitioner":"Runs a processing job on a provisioned cloud VM.","proficient":"Designs a cost-aware pipeline using object storage and managed compute.","expert":"Plans the division''s cloud migration and capacity."}'::jsonb, 470),

('TEC-BIGD-01','Big Data Processing','technical','Data Engineering',
 'Handles datasets that exceed a single machine — scanner data, mobile network data, satellite imagery.',
 '{"beginner":"Recognises when a dataset will not fit in Excel or memory.","practitioner":"Processes large files in chunks; uses columnar formats like Parquet.","proficient":"Builds distributed processing jobs and validates results against a sample.","expert":"Leads the technical design of alternative-data statistical products."}'::jsonb, 480),

-- ─────────────────────────────────────────────────────────────────────────────
--  DIGITAL GOVERNANCE
-- ─────────────────────────────────────────────────────────────────────────────
('DIG-CYBER-01','Cybersecurity Awareness','digital_governance','Security',
 'Recognises and mitigates cyber risk in day-to-day handling of official statistical data.',
 '{"beginner":"Identifies phishing attempts and uses strong unique passwords.","practitioner":"Applies secure file transfer and access-control practice for microdata.","proficient":"Conducts risk assessment for a statistical system and enforces controls.","expert":"Owns the security posture of the division''s data assets."}'::jsonb, 500),

('DIG-PRIV-01','Data Privacy and the DPDP Act','digital_governance','Law & Compliance',
 'Applies the Digital Personal Data Protection Act 2023 and the Collection of Statistics Act to statistical work.',
 '{"beginner":"Knows that respondent data is personal data with legal protection.","practitioner":"Applies purpose limitation and data minimisation to a survey design.","proficient":"Conducts a data protection impact assessment for a new collection.","expert":"Advises the Ministry on privacy-compliant statistical practice."}'::jsonb, 510),

('DIG-ESIGN-01','Digital Signatures and e-Office','digital_governance','Digital Workflow',
 'Uses DSC/eSign and the e-Office system for authenticated official statistical workflows.',
 '{"beginner":"Signs a document using a DSC token.","practitioner":"Routes files through e-Office with correct authentication.","proficient":"Designs an authenticated approval workflow for statistical releases.","expert":"Sets digital authentication policy for the organisation."}'::jsonb, 520),

('DIG-DPI-01','Digital Public Infrastructure','digital_governance','Ecosystem',
 'Understands India Stack (Aadhaar, UPI, DigiLocker, Account Aggregator) as both a data source and a governance model.',
 '{"beginner":"Names the main DPI components.","practitioner":"Explains how DPI transaction data could inform statistics, and its coverage limits.","proficient":"Assesses DPI-derived data for statistical fitness-for-use and consent constraints.","expert":"Shapes how the statistical system draws on DPI responsibly."}'::jsonb, 530),

('DIG-OPEN-01','Open Data and Data Sharing Policy','digital_governance','Policy',
 'Applies NDSAP and government data-sharing policy when releasing statistical assets.',
 '{"beginner":"Knows data.gov.in exists and what NDSAP is for.","practitioner":"Publishes a dataset with correct licence and metadata.","proficient":"Designs a tiered access model spanning open, restricted and safe-room data.","expert":"Sets the organisation''s open-data strategy."}'::jsonb, 540)

on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  ROLE REQUIREMENTS for the new families
--  The technical bar rises sharply with seniority — an Assistant Director is
--  now expected to reason about ML admissibility, not just read a tabulation.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  for m in
    select * from (values
      -- Field Investigator: digital hygiene, minimal tooling
      ('FI','DIG-CYBER-01','beginner',1.5,true),
      ('FI','DIG-PRIV-01','beginner',2.0,true),
      ('FI','TEC-SQL-01','unskilled',0.5,false),

      -- Junior Statistical Officer
      ('JSO','TEC-SQL-01','beginner',2.0,true),
      ('JSO','TEC-PY-01','beginner',1.5,false),
      ('JSO','TEC-VIZ-01','beginner',1.0,false),
      ('JSO','DIG-CYBER-01','practitioner',1.5,true),
      ('JSO','DIG-PRIV-01','practitioner',2.0,true),
      ('JSO','DIG-ESIGN-01','beginner',1.0,false),

      -- Senior Statistical Officer
      ('SSO','TEC-SQL-01','practitioner',2.0,true),
      ('SSO','TEC-PY-01','practitioner',2.0,true),
      ('SSO','TEC-R-01','beginner',1.5,false),
      ('SSO','TEC-VIZ-01','practitioner',1.5,false),
      ('SSO','TEC-GIS-01','beginner',1.5,false),
      ('SSO','DIG-CYBER-01','practitioner',1.5,true),
      ('SSO','DIG-PRIV-01','practitioner',2.0,true),

      -- Assistant Director
      ('ASD','TEC-PY-01','proficient',2.5,true),
      ('ASD','TEC-SQL-01','proficient',2.0,true),
      ('ASD','TEC-GIS-01','practitioner',2.0,false),
      ('ASD','TEC-ML-01','beginner',1.5,false),
      ('ASD','TEC-API-01','practitioner',1.5,false),
      ('ASD','DIG-PRIV-01','proficient',2.5,true),
      ('ASD','DIG-CYBER-01','proficient',2.0,true),
      ('ASD','DIG-OPEN-01','practitioner',1.5,false),

      -- Deputy Director
      ('DD','TEC-ML-01','practitioner',2.0,false),
      ('DD','TEC-CLOUD-01','beginner',1.5,false),
      ('DD','TEC-BIGD-01','practitioner',2.0,false),
      ('DD','TEC-API-01','proficient',2.0,true),
      ('DD','DIG-PRIV-01','expert',2.5,true),
      ('DD','DIG-DPI-01','practitioner',1.5,false),
      ('DD','DIG-OPEN-01','proficient',2.0,true),

      -- Director
      ('DIR','TEC-ML-01','proficient',2.0,false),
      ('DIR','TEC-CLOUD-01','practitioner',2.0,false),
      ('DIR','DIG-PRIV-01','expert',3.0,true),
      ('DIR','DIG-CYBER-01','expert',2.5,true),
      ('DIR','DIG-DPI-01','proficient',2.0,false),
      ('DIR','DIG-OPEN-01','expert',2.5,true)
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
--  PREREQUISITES for the new competencies
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  for m in
    select * from (values
      ('TEC-PY-01','TEC-SQL-01',      0.4,'beginner',     'Getting data out is the first step; most Python work starts with a query.'),
      ('TEC-ML-01','TEC-PY-01',       1.0,'practitioner', 'ML in practice is written in Python — the tooling is not optional.'),
      ('TEC-ML-01','FUN-ANAL-01',     0.9,'practitioner', 'Without inference, a model is a black box you cannot defend to a reviewer.'),
      ('TEC-BIGD-01','TEC-SQL-01',    0.7,'practitioner', 'Large-scale processing is query thinking at a different scale.'),
      ('TEC-BIGD-01','TEC-CLOUD-01',  0.6,'beginner',     'Data beyond one machine implies managed infrastructure.'),
      ('TEC-VIZ-01','TEC-SQL-01',     0.6,'beginner',     'A dashboard is only as good as the query behind it.'),
      ('TEC-GIS-01','TEC-SQL-01',     0.4,'beginner',     'Spatial joins are joins.'),
      ('TEC-API-01','TEC-SQL-01',     0.3,'beginner',     'Both are about moving structured data between systems.'),
      ('FUN-BIGD-01','TEC-BIGD-01',   0.8,'practitioner', 'Assessing alternative data requires being able to process it first.'),
      ('DIG-PRIV-01','FUN-CONF-01',   0.7,'practitioner', 'Statutory confidentiality is the statistical expression of data protection.'),
      ('DIG-OPEN-01','FUN-DISS-01',   0.8,'practitioner', 'Open data policy governs the dissemination you already do.'),
      ('DIG-OPEN-01','DIG-PRIV-01',   0.9,'practitioner', 'You cannot decide what is safe to open without knowing what is protected.'),
      ('DIG-DPI-01','DIG-PRIV-01',    0.7,'practitioner', 'DPI data is consent-bound; privacy comes first.'),
      ('TEC-CLOUD-01','DIG-CYBER-01', 0.8,'practitioner', 'Moving official data to cloud without security literacy is a breach waiting to happen.')
    ) as t(target, prereq, strength, min_level, rationale)
  loop
    insert into public.competency_prerequisites
      (competency_id, prerequisite_id, strength, min_level, rationale)
    select tc.id, pc.id, m.strength, m.min_level::public.proficiency_level, m.rationale
    from public.competencies tc, public.competencies pc
    where tc.code = m.target and pc.code = m.prereq
    on conflict (competency_id, prerequisite_id) do nothing;
  end loop;
end $$;
