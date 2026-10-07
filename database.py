import sqlite3
from datetime import datetime


def get_connection():
    return sqlite3.connect("moderation.db")


def init_db():
    """Initializes the moderation database"""
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS moderations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    connection.commit()
    connection.close()


def save_moderation(text: str, category: str, confidence: float):
    """Adds a new moderation record to the database."""
    connection = get_connection()
    cursor = connection.cursor()
    created_at = datetime.now().strftime("%d.%m, %H:%M")

    cursor.execute("""
        INSERT INTO moderations (
            text, category, confidence, created_at
        )
        VALUES (?, ?, ?, ?)
    """, (text, category, confidence, created_at))
    connection.commit()
    connection.close()


def get_history():
    """Returns all moderation records."""
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("SELECT * FROM moderations")
    rows = cursor.fetchall()

    connection.close()
    return rows

