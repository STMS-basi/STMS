-- BASI - Subscription Status Migration
-- Back up the database before execution.
-- Stop the backend before applying this migration.

SET SERVEROUTPUT ON

DECLARE
    v_condition VARCHAR2(4000);
    v_status VARCHAR2(20);
    v_validated VARCHAR2(20);
    v_temp NUMBER;
BEGIN
    IF USER <> 'SCHOOL_TRANSPORT'
       OR SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') <> 'SCHOOL_TRANSPORT'
       OR SYS_CONTEXT('USERENV', 'CON_NAME') <> 'XEPDB1'
    THEN
        RAISE_APPLICATION_ERROR(-20001, 'Wrong schema or container');
    END IF;

    SELECT COUNT(*)
    INTO v_temp
    FROM USER_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'CK_SUBS_STATUS_NEW';

    IF v_temp > 0 THEN
        RAISE_APPLICATION_ERROR(-20002, 'Partial migration detected');
    END IF;

    SELECT REGEXP_REPLACE(SEARCH_CONDITION_VC, '[[:space:]]+', ''),
           STATUS,
           VALIDATED
    INTO v_condition, v_status, v_validated
    FROM USER_CONSTRAINTS
    WHERE TABLE_NAME = 'SUBSCRIPTIONS'
      AND CONSTRAINT_NAME = 'CK_SUBS_STATUS'
      AND CONSTRAINT_TYPE = 'C';

    v_condition := REGEXP_REPLACE(
        v_condition, '^STATUSIN', 'STATUSIN', 1, 1, 'i'
    );

    IF v_status <> 'ENABLED' OR v_validated <> 'VALIDATED' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Unexpected constraint state');
    END IF;

    IF v_condition =
        q'[STATUSIN('Pending','AwaitingPayment','Approved','Rejected','Cancelled')]'
    THEN
        DBMS_OUTPUT.PUT_LINE('Migration already applied.');

    ELSIF v_condition =
        q'[STATUSIN('Pending','Approved','Rejected','Cancelled')]'
    THEN
        EXECUTE IMMEDIATE '
            ALTER TABLE SCHOOL_TRANSPORT.SUBSCRIPTIONS
            ADD CONSTRAINT CK_SUBS_STATUS_NEW
            CHECK (Status IN (
                ''Pending'',
                ''AwaitingPayment'',
                ''Approved'',
                ''Rejected'',
                ''Cancelled''
            )) ENABLE VALIDATE';

        EXECUTE IMMEDIATE '
            ALTER TABLE SCHOOL_TRANSPORT.SUBSCRIPTIONS
            DROP CONSTRAINT CK_SUBS_STATUS';

        EXECUTE IMMEDIATE '
            ALTER TABLE SCHOOL_TRANSPORT.SUBSCRIPTIONS
            RENAME CONSTRAINT CK_SUBS_STATUS_NEW
            TO CK_SUBS_STATUS';

        DBMS_OUTPUT.PUT_LINE('Subscription status migration completed.');
    ELSE
        RAISE_APPLICATION_ERROR(-20004, 'Unexpected constraint definition');
    END IF;
END;
/