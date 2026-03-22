CREATE TABLE member_invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        UUID NOT NULL REFERENCES clubs(id),
  token          VARCHAR(64) NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL,
  tier           VARCHAR(20) NOT NULL DEFAULT 'member',
  invited_by     UUID NOT NULL REFERENCES members(id),
  application_id UUID REFERENCES membership_applications(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at    TIMESTAMP WITH TIME ZONE,
  accepted_by    UUID REFERENCES members(id),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX idx_member_invitations_token ON member_invitations(token);
CREATE INDEX idx_member_invitations_club_status ON member_invitations(club_id, status);
CREATE INDEX idx_member_invitations_email ON member_invitations(club_id, email);
