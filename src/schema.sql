CREATE TABLE IF NOT EXISTS feed_head(id integer PRIMARY KEY CHECK(id=1),cursor bigint NOT NULL);
INSERT INTO feed_head VALUES(1,0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY,version_id uuid,state text NOT NULL DEFAULT 'BORRADOR',head_hash text);
CREATE TABLE IF NOT EXISTS versions(id uuid PRIMARY KEY,doc_id uuid REFERENCES documents(id),number integer NOT NULL,bytes bytea NOT NULL,body jsonb NOT NULL,hash text NOT NULL,previous_id uuid,rectifies_id uuid,UNIQUE(doc_id,number));
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY,cursor bigint UNIQUE NOT NULL,doc_id uuid REFERENCES documents(id),record jsonb NOT NULL,canonical text NOT NULL,hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE events ADD COLUMN IF NOT EXISTS proposal jsonb;
CREATE TABLE IF NOT EXISTS plans(id uuid PRIMARY KEY,doc_id uuid REFERENCES documents(id),base_id uuid NOT NULL,body jsonb NOT NULL,hash text NOT NULL,requester text NOT NULL,approver text,reason text NOT NULL,state text NOT NULL,rectification boolean NOT NULL);
CREATE TABLE IF NOT EXISTS commands(actor text NOT NULL,id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor,id));
CREATE TABLE IF NOT EXISTS outbox(event_id uuid PRIMARY KEY REFERENCES events(id),state text NOT NULL DEFAULT 'PENDING',attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,next_attempt timestamptz NOT NULL DEFAULT now(),tx_id text,error text);
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS lease_token uuid;
CREATE TABLE IF NOT EXISTS acks(org text NOT NULL,event_id uuid REFERENCES events(id),actor text NOT NULL,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org,event_id));
CREATE INDEX IF NOT EXISTS event_doc_cursor ON events(doc_id,cursor);
CREATE INDEX IF NOT EXISTS outbox_schedule ON outbox(state,next_attempt);
CREATE INDEX IF NOT EXISTS plans_document ON plans(doc_id,state);

-- Queue order copied from the durable event cursor; migrate legacy lab rows once.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS queue_cursor bigint;
UPDATE outbox o SET queue_cursor=e.cursor FROM events e WHERE e.id=o.event_id AND o.queue_cursor IS NULL;
ALTER TABLE outbox ALTER COLUMN queue_cursor SET NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_active_cursor ON outbox(queue_cursor) WHERE state IN ('PENDING','RETRY','UNKNOWN','PROCESSING');

-- Membership of the current version: NOT VALID preserves old rows during migration,
-- while rejecting new foreign-document pointers. Verification also audits existing rows.
CREATE UNIQUE INDEX IF NOT EXISTS versions_document_identity ON versions(doc_id,id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='documents'::regclass AND conname='document_current_version_owner') THEN
  ALTER TABLE documents ADD CONSTRAINT document_current_version_owner FOREIGN KEY(id,version_id) REFERENCES versions(doc_id,id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS audit_changes(
 id bigserial PRIMARY KEY,table_name text NOT NULL,operation text NOT NULL,
 old_row jsonb,new_row jsonb,db_user text NOT NULL,db_session_user text NOT NULL,
 transaction_id text NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 origin text NOT NULL,claimed_actor text,event_id uuid REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS audit_changes_pending ON audit_changes(id) WHERE origin='SQL' AND event_id IS NULL;
CREATE OR REPLACE FUNCTION capture_judicial_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_value jsonb; new_value jsonb; origin_value text;
BEGIN
 IF TG_OP='DELETE' THEN old_value:=to_jsonb(OLD); ELSE old_value:=to_jsonb(OLD);new_value:=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND old_value IS NOT DISTINCT FROM new_value THEN RETURN NEW; END IF;
 origin_value:=COALESCE(NULLIF(current_setting('mahafj.origin',true),''),'SQL');
 INSERT INTO audit_changes(table_name,operation,old_row,new_row,db_user,db_session_user,transaction_id,origin,claimed_actor)
 VALUES(TG_TABLE_NAME,TG_OP,old_value,new_value,current_user,session_user,txid_current()::text,origin_value,NULLIF(current_setting('mahafj.actor',true),''));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION prevent_judicial_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TRUNCATE_PROTEGIDO'; END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['documents','versions','plans','events','outbox','acks'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(name) AND tgname='capture_judicial') THEN
   EXECUTE format('CREATE TRIGGER capture_judicial AFTER UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_judicial_change()',name);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(name) AND tgname='protect_truncate') THEN
   EXECUTE format('CREATE TRIGGER protect_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_judicial_truncate()',name);
  END IF;
 END LOOP;
END $$;
