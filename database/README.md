# BASI - Database Setup

## Database Connection

- Host: localhost
- Port: 1521
- Service Name: XEPDB1
- Schema: SCHOOL_TRANSPORT
- Database: Oracle XE 21c

## 1. Fresh Database Setup

| # | File | Run as | Purpose |
|---|------|--------|---------|
| 0 | 00_create_user.sql | SYSTEM | Create the school_transport schema |
| 1 | 01_create_tables.sql | school_transport | Create the 10 tables |
| 2 | 02_sample_data.sql | school_transport | Insert sample data |
| 3 | 03_add_trip_direction.sql | school_transport | Add TripDirection column and constraint |

The updated 01_create_tables.sql already supports AwaitingPayment.
Sample data is optional.

## 2. Existing Database Upgrade

Before upgrading:

- Stop the backend.
- Back up the database and verify the backup.
- Connect to SCHOOL_TRANSPORT inside XEPDB1.

Run the following migrations as school_transport:

| File | Purpose |
|------|---------|
| 03_add_trip_direction.sql | Add TripDirection support |
| 04_update_subscription_status.sql | Add AwaitingPayment support |

Migration 03 must not be executed again if its column and
constraint already exist and have been verified.

Migration 04 supports re-execution when the expected
constraint is already applied.

If a migration fails, inspect the database before retrying.
Oracle DDL statements commit automatically.

Do not recreate tables or run sample data on an existing database.

## 3. Subscription Rules

Supported statuses:

- Pending
- AwaitingPayment
- Approved
- Rejected
- Cancelled

Supported transport types and directions:

| Transport Type | TripDirection | Semester Fee |
|----------------|---------------|--------------|
| OneWay | MorningPickup | 150 JOD |
| OneWay | AfternoonDropoff | 150 JOD |
| RoundTrip | Both | 300 JOD |

Existing subscriptions may have a NULL TripDirection
for backward compatibility.

Payment statuses:

- Unpaid
- Partial (legacy compatibility)
- Paid

## 4. Reset Script

reset_drop_tables.sql is destructive.

Use it only when intentionally resetting a disposable
development database. Never use it for a normal upgrade.

## 5. Security Notes

- USERS.Password stores a BCrypt hash, never plain text.
- Sample data uses a placeholder hash.
- Do not commit real passwords.
- Do not commit JWT signing keys or database credentials.
- Do not commit database backups or personal user data.