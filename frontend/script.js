const BASE_URL = "http://127.0.0.1:8000";

const remediationForm = document.getElementById("remediation-form");
const statusLabel = document.getElementById("status-label");
const endpointLabel = document.getElementById("endpoint-label");
const remediationText = document.getElementById("remediation-text");
const flashcardCard = document.getElementById("flashcard-card");
const insightText = document.getElementById("insight-text");

const setStatus = (text, isError = false) => {
    statusLabel.textContent = text;
    statusLabel.classList.toggle("error-text", isError);
    statusLabel.classList.toggle("loading", text.toLowerCase().includes("loading") || text.toLowerCase().includes("generating"));
};

const setEndpointLabel = (text) => {
    endpointLabel.textContent = text;
};

const handleError = (message) => {
    setStatus(message, true);
};

const createFlashcardMarkup = (topic, question) => {
    const container = document.createElement("div");
    container.className = "flashcard";

    const prompt = document.createElement("p");
    prompt.className = "flashcard__prompt";
    prompt.textContent = topic ? `Topic: ${topic}` : "Flashcard";

    const questionEl = document.createElement("p");
    questionEl.className = "flashcard__question";
    questionEl.textContent = question || "No question returned.";

    const footnote = document.createElement("p");
    footnote.className = "flashcard__footnote";
    footnote.textContent = "Keep practicing for mastery.";

    container.append(prompt, questionEl, footnote);
    return container;
};

const fetchRemediation = async (payload) => {
    setEndpointLabel("POST /api/ai/remediation");
    setStatus("Generating remediation...");

    try {
        const response = await fetch(`${BASE_URL}/api/ai/remediation`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        remediationText.textContent = data.remediation || "No remediation message returned.";
        setStatus("Remediation ready");
    } catch (error) {
        handleError("Failed to fetch remediation");
        remediationText.textContent = "Please try again.";
    }
};

const fetchFlashcards = async () => {
    setEndpointLabel("GET /api/ai/flashcard/1");
    setStatus("Loading flashcard...");

    try {
        const response = await fetch(`${BASE_URL}/api/ai/flashcard/1`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const topic = data.topic || "Flashcard";
        const question = data.flashcard_question || data.question || JSON.stringify(data);

        flashcardCard.innerHTML = "";
        flashcardCard.appendChild(createFlashcardMarkup(topic, question));
        setStatus("Flashcard updated");
    } catch (error) {
        handleError("Failed to fetch flashcard");
        flashcardCard.textContent = "Unable to load flashcard.";
    }
};

const fetchInsights = async () => {
    setEndpointLabel("GET /api/ai/ghost-learner/1");
    setStatus("Loading insight...");

    try {
        const response = await fetch(`${BASE_URL}/api/ai/ghost-learner/1`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        insightText.innerHTML = `<strong>Insight:</strong> ${data.social_insight || JSON.stringify(data)}`;
        setStatus("Insight ready");
    } catch (error) {
        handleError("Failed to fetch insight");
        insightText.textContent = "Unable to load insight.";
    }
};

remediationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(remediationForm);
    const payload = {
        wrong_answer: formData.get("wrong_answer"),
        question_text: formData.get("question_text"),
        lo_content_text: formData.get("lo_content_text")
    };

    fetchRemediation(payload);
});

document.getElementById("btn-flashcard").addEventListener("click", fetchFlashcards);
document.getElementById("btn-insights").addEventListener("click", fetchInsights);
