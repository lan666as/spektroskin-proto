"""Create a user if it does not exist (idempotent); with --update-password, also reset the
password of an existing user. The password is read from stdin so it never
appears in argv, shell history or logs.

    security find-generic-password -s spektroskin-demo-clinician -w | \\
      python -m scripts.create_user --username clinician --role clinician \\
        --display-name "dr. Demo Clinician" --password-stdin
"""

import argparse
import sys

from sqlalchemy import select

from app.auth import hash_password, verify_password
from app.db import get_sessionmaker
from app.models import ROLES, User

MIN_PASSWORD_LENGTH = 8


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True)
    parser.add_argument("--role", required=True, choices=ROLES)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--password-stdin", action="store_true", required=True)
    parser.add_argument(
        "--test-user",
        action="store_true",
        help="automated smoke/e2e account (kept out of demo views)",
    )
    parser.add_argument(
        "--update-password",
        action="store_true",
        help="reset the password if the user exists (the caller's secret store is the source)",
    )
    args = parser.parse_args()

    password = sys.stdin.readline().rstrip("\n")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"password must be at least {MIN_PASSWORD_LENGTH} characters", file=sys.stderr)
        return 2

    with get_sessionmaker()() as session:
        existing = session.scalar(select(User).where(User.username == args.username))
        if existing is not None:
            if existing.role != args.role:
                print(f"user {args.username} exists with role {existing.role}", file=sys.stderr)
                return 1
            if args.update_password and not verify_password(password, existing.password_hash):
                existing.password_hash = hash_password(password)
                session.commit()
                print(f"user {args.username} exists; password updated")
                return 0
            print(f"user {args.username} exists; unchanged")
            return 0
        session.add(
            User(
                username=args.username,
                role=args.role,
                display_name=args.display_name,
                password_hash=hash_password(password),
                is_test=args.test_user,
            )
        )
        session.commit()
    print(f"user {args.username} created")
    return 0


if __name__ == "__main__":
    sys.exit(main())
