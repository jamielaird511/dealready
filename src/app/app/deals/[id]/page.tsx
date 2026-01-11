"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [creatingSubmission, setCreatingSubmission] = useState(false);

  useEffect(() => {
    async function loadDeal() {
      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("deals")
        .select("*")
        .eq("id", dealId)
        .single();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setDeal(data);
      setLoading(false);
    }

    if (dealId) {
      loadDeal();
    }
  }, [dealId]);

  useEffect(() => {
    async function loadSubmissions() {
      if (!dealId) return;

      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submissions")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error loading submissions:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setSubmissionsLoading(false);
        return;
      }

      setSubmissions(data || []);
      setSubmissionsLoading(false);
    }

    if (dealId && !loading) {
      loadSubmissions();
    }
  }, [dealId, loading]);

  async function createSubmission() {
    setCreatingSubmission(true);
    const supabase = supabaseBrowser();

    try {
      // Get signed-in user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Error getting user:", userError);
        alert("Error: Not authenticated. Please sign in again.");
        setCreatingSubmission(false);
        return;
      }

      // Fetch organization_id from organization_members table
      const { data: orgMember, error: orgError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (orgError || !orgMember?.organization_id) {
        console.error("Error fetching organization:", orgError);
        alert("Error: Could not find organization. Please contact support.");
        setCreatingSubmission(false);
        return;
      }

      const orgId = orgMember.organization_id;

      // Generate title from deal name
      const title = deal?.name ? `${deal.name} – Submission` : "New Submission";

      // Insert submission with required fields
      const { data: submission, error } = await supabase
        .from("submissions")
        .insert({
          org_id: orgId,
          created_by: user.id,
          title: title,
          deal_id: dealId,
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating submission:", error);
        console.error("Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        alert("Error creating submission. Please try again.");
        setCreatingSubmission(false);
        return;
      }

      // Route to submission page
      router.push(`/app/submissions/${submission.id}`);
      setCreatingSubmission(false);
    } catch (err) {
      console.error("Error:", err);
      setCreatingSubmission(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p>Loading deal...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p style={{ color: "crimson" }}>Error: {error}</p>
        <button
          onClick={() => router.push("/app")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Back to App
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/app")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>{deal?.name || "Deal"}</h1>
            {deal?.status && (
              <p style={{ opacity: 0.8, marginBottom: 0 }}>
                Status: {deal.status}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Submissions Section */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 0 }}>Submissions</h2>
          <button
            onClick={createSubmission}
            disabled={creatingSubmission}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: creatingSubmission ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: creatingSubmission ? 0.6 : 1,
            }}
          >
            {creatingSubmission ? "Creating..." : "Create Submission"}
          </button>
        </div>

        {submissionsLoading ? (
          <p style={{ opacity: 0.6 }}>Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No submissions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {submissions.map((submission) => (
              <div
                key={submission.id}
                onClick={() => {
                  router.push(`/app/submissions/${submission.id}`);
                }}
                style={{
                  border: "1px solid rgba(0,0,0,0.2)",
                  borderRadius: 10,
                  padding: 16,
                  background: "white",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {submission.lender_name || "Unnamed Lender"}
                    </div>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>
                      Status: {submission.status || "draft"}
                    </div>
                    {submission.created_at && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                        Created: {new Date(submission.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>
                    {submission.id.substring(0, 8)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deal Details (existing) */}
      {deal && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 20,
            background: "white",
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Deal Details</h3>
          <pre style={{ fontSize: 14, overflow: "auto" }}>
            {JSON.stringify(deal, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
