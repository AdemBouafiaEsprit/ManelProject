import psycopg2
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://reefer_user:reefer_pass@localhost:5432/reefer_db",
)


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name='blocks' AND column_name='rotation'"
        )
        if cur.fetchone()[0]:
            print("ℹ️  Column 'rotation' already exists — nothing to do.")
            return
        cur.execute("ALTER TABLE blocks ADD COLUMN rotation FLOAT DEFAULT 0.0")
        conn.commit()
        print("✅ Migration complete: rotation column added to blocks table.")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
