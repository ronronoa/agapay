ALTER TABLE "SupportMessage"
  DROP CONSTRAINT "SupportMessage_senderRole_check",
  ADD CONSTRAINT "SupportMessage_senderRole_check"
    CHECK ("senderRole" IN ('DONOR', 'STAFF', 'ADMIN', 'SUPER_ADMIN'));
