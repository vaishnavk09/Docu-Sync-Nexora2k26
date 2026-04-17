"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

type Team = {
  _id: string;
  name: string;
  ownerId: string;
  members: string[];
};

export default function TeamManager({
  user,
  onTeamSelect,
  activeTeamId,
}: {
  user: User;
  onTeamSelect: (teamId: string | null) => void;
  activeTeamId: string | null;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [user]);

  const fetchTeams = async () => {
    try {
      const res = await fetch(`/api/teams?userId=${user.uid}&userEmail=${user.email}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName,
          ownerId: user.uid,
          ownerEmail: user.email,
        }),
      });
      if (res.ok) {
        setNewTeamName("");
        fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleAddMember = async (teamId: string) => {
    if (!newMemberEmail.trim()) return;
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMemberEmail }),
      });
      if (res.ok) {
        setNewMemberEmail("");
        fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveMember = async (teamId: string, email: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm("Are you sure you want to delete this team?")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}?ownerId=${user.uid}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeTeamId === teamId) onTeamSelect(null);
        fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {teams.length > 0 && (
        <select
          value={activeTeamId || ""}
          onChange={(e) => onTeamSelect(e.target.value || null)}
          className="input-base"
        >
          <option value="">Global Docs (No Team)</option>
          {teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={() => setIsModalOpen(true)}
        className="btn btn-outline"
        style={{ fontSize: "12px", padding: "4px 8px" }}
      >
        Manage Teams
      </button>
    </div>

      {isModalOpen && (
        <div style={modalOverlayStyle} className="animate-fade-in">
          <div style={modalStyle} className="animate-slide-up">
            <div style={headerStyle}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Manage Teams</h3>
              <button onClick={() => setIsModalOpen(false)} style={closeButtonStyle}>
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <h4>Create New Team</h4>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Team Name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="input-base"
                />
                <button onClick={handleCreateTeam} disabled={loading} className="btn btn-primary">
                  Create
                </button>
              </div>
            </div>

            <div>
              <h4>Your Teams</h4>
              {teams.length === 0 ? (
                <p style={{ color: "#6b7280", fontSize: 13 }}>No teams yet.</p>
              ) : (
                teams.map((team) => (
                  <div key={team._id} style={teamCardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "1rem" }}>{team.name}</strong>
                      {team.ownerId === user.uid && (
                        <button onClick={() => handleDeleteTeam(team._id)} className="btn btn-outline" style={{ borderColor: 'var(--foreground-muted)' }}>
                          Delete
                        </button>
                      )}
                    </div>
                    <div style={{ margin: "10px 0", fontSize: 13 }}>
                      <strong>Members:</strong>
                      <ul style={{ paddingLeft: 20, margin: "5px 0" }}>
                        {team.members.map((memberEmail) => (
                          <li key={memberEmail} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {memberEmail}
                            {team.ownerId === user.uid && memberEmail !== user.email && (
                              <button
                                onClick={() => handleRemoveMember(team._id, memberEmail)}
                                className="btn btn-ghost"
                                style={{ padding: "2px 6px", fontSize: "11px" }}
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {team.ownerId === user.uid && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <input
                          type="email"
                          placeholder="Invite user email"
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                          className="input-base"
                        />
                        <button onClick={() => handleAddMember(team._id)} className="btn btn-primary">
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Inline styles for simplicity
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 10000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-subtle)",
  padding: "24px",
  borderRadius: "16px",
  width: "500px",
  maxWidth: "90vw",
  maxHeight: "80vh",
  overflowY: "auto",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
  color: "var(--foreground)"
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const closeButtonStyle: React.CSSProperties = {
  background: "var(--surface-hover)",
  border: "none",
  borderRadius: "50%",
  width: "28px",
  height: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  cursor: "pointer",
  color: "var(--foreground-muted)",
};

const teamCardStyle: React.CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "12px",
  backgroundColor: "var(--surface-hover)",
};
