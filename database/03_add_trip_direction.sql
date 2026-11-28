-- BASI - Trip Direction Migration
-- Target: SCHOOL_TRANSPORT
-- Do not run before deployment approval and database backup.
SET SERVEROUTPUT ON
DECLARE
    v_columns NUMBER;
    v_constraints NUMBER;
BEGIN
    IF SYS_CONTEXT('USERENV', 'SESSION_USER')
           <> 'SCHOOL_TRANSPORT'
       OR SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
           <> 'SCHOOL_TRANSPORT'
       OR SYS_CONTEXT('USERENV', 'CON_NAME')
           <> 'XEPDB1'
    THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'SAFETY: Wrong database environment.'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_columns
    FROM USER_TAB_COLUMNS
    WHERE TABLE_NAME = 'SUBSCRIPTIONS'
      AND COLUMN_NAME = 'TRIPDIRECTION';

    SELECT COUNT(*)
    INTO v_constraints
    FROM USER_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'CK_SUBS_TRIP_DIRECTION';

    IF v_columns > 0 OR v_constraints > 0 THEN
        RAISE_APPLICATION_ERROR(
            -20002,
            'Migration already or partially applied.'
        );
    END IF;

    EXECUTE IMMEDIATE '
        ALTER TABLE SCHOOL_TRANSPORT.SUBSCRIPTIONS
        ADD (TRIPDIRECTION VARCHAR2(20))';

    EXECUTE IMMEDIATE '
        ALTER TABLE SCHOOL_TRANSPORT.SUBSCRIPTIONS
        ADD CONSTRAINT CK_SUBS_TRIP_DIRECTION
        CHECK (
            TRIPDIRECTION IS NULL
            OR (
                TRANSPORTTYPE = ''OneWay''
                AND TRIPDIRECTION IN (
                    ''MorningPickup'',
                    ''AfternoonDropoff''
                )
            )
            OR (
                TRANSPORTTYPE = ''RoundTrip''
                AND TRIPDIRECTION = ''Both''
            )
        ) ENABLE VALIDATE';

    DBMS_OUTPUT.PUT_LINE(
        'TripDirection migration completed successfully.'
    );
END;
/
