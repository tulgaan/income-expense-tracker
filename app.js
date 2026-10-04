const SUPABASE_URL = "https://dgxjmadnflxajrfbplge.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_K55vT13cwvKBE52AvlhVhQ_KivT3dNC";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

let currentUser = null;
let transactions = [];
let budgets = [];
let monthlyChart = null;
let categoryChart = null;

const authPage = document.getElementById("authPage");
const appPage = document.getElementById("appPage");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const authMessage = document.getElementById("authMessage");

const transactionForm = document.getElementById("transactionForm");
const budgetForm = document.getElementById("budgetForm");

const transactionModalElement = document.getElementById("transactionModal");
const transactionModal = new bootstrap.Modal(transactionModalElement);

document.getElementById("transactionDate").value =
    new Date().toISOString().split("T")[0];

loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    loginForm.classList.remove("d-none");
    registerForm.classList.add("d-none");

    authMessage.innerHTML = "";
});

registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");

    registerForm.classList.remove("d-none");
    loginForm.classList.add("d-none");

    authMessage.innerHTML = "";
});

registerForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    if (error) {
        showAuthMessage(error.message, "danger");
        return;
    }

    if (data.session) {
        currentUser = data.user;
        await showApp();
    } else {
        showAuthMessage(
            "Бүртгэл амжилттай. И-мэйл баталгаажуулалт шаардлагатай бол и-мэйлээ шалгана уу.",
            "success"
        );
    }
});

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        showAuthMessage("И-мэйл эсвэл нууц үг буруу байна.", "danger");
        return;
    }

    currentUser = data.user;

    await showApp();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();

    currentUser = null;

    appPage.classList.add("d-none");
    authPage.classList.remove("d-none");
});

transactionForm.addEventListener("submit", async event => {
    event.preventDefault();

    const id = document.getElementById("transactionId").value;

    const transaction = {
        user_id: currentUser.id,
        type: document.getElementById("transactionType").value,
        category: document.getElementById("transactionCategory").value,
        amount: Number(document.getElementById("transactionAmount").value),
        date: document.getElementById("transactionDate").value,
        description: document.getElementById("transactionDescription").value.trim()
    };

    let error;

    if (id) {
        const result = await supabaseClient
            .from("transactions")
            .update(transaction)
            .eq("id", id)
            .eq("user_id", currentUser.id);

        error = result.error;
    } else {
        const result = await supabaseClient
            .from("transactions")
            .insert(transaction);

        error = result.error;
    }

    if (error) {
        alert(error.message);
        return;
    }

    transactionModal.hide();

    resetTransactionForm();

    await loadData();
});

budgetForm.addEventListener("submit", async event => {
    event.preventDefault();

    const category =
        document.getElementById("budgetCategory").value;

    const limitAmount =
        Number(document.getElementById("budgetAmount").value);

    const monthYear = getCurrentMonth();

    const { error } = await supabaseClient
        .from("budgets")
        .upsert(
            {
                user_id: currentUser.id,
                category,
                limit_amount: limitAmount,
                month_year: monthYear
            },
            {
                onConflict: "user_id,category,month_year"
            }
        );

    if (error) {
        alert(error.message);
        return;
    }

    budgetForm.reset();

    await loadData();
});

document.getElementById("transactionFilter")
    .addEventListener("change", renderTransactions);

async function showApp() {
    authPage.classList.add("d-none");
    appPage.classList.remove("d-none");

    document.getElementById("userEmail").textContent =
        currentUser.email;

    await loadData();
}

async function loadData() {
    await Promise.all([
        loadTransactions(),
        loadBudgets()
    ]);

    renderDashboard();
    renderTransactions();
    renderBudgets();
    renderBadges();
    renderCharts();
}

async function loadTransactions() {
    const { data, error } = await supabaseClient
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    transactions = data || [];
}

async function loadBudgets() {
    const { data, error } = await supabaseClient
        .from("budgets")
        .select("*")
        .eq("month_year", getCurrentMonth());

    if (error) {
        console.error(error);
        return;
    }

    budgets = data || [];
}

function renderDashboard() {
    const income = transactions
        .filter(item => item.type === "орлого")
        .reduce((sum, item) => sum + Number(item.amount), 0);

    const expense = transactions
        .filter(item => item.type === "зарлага")
        .reduce((sum, item) => sum + Number(item.amount), 0);

    const balance = income - expense;

    document.getElementById("totalIncome").textContent =
        formatMoney(income);

    document.getElementById("totalExpense").textContent =
        formatMoney(expense);

    document.getElementById("balance").textContent =
        formatMoney(balance);
}

function renderTransactions() {
    const tbody = document.getElementById("transactionTable");

    const filter =
        document.getElementById("transactionFilter").value;

    const filtered = filter === "all"
        ? transactions
        : transactions.filter(item => item.type === filter);

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted">
                    Гүйлгээ бүртгэгдээгүй байна.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const income = item.type === "орлого";

        return `
            <tr>
                <td>
                    <span class="transaction-type ${income ? "type-income" : "type-expense"}">
                        ${escapeHtml(item.type)}
                    </span>
                </td>

                <td>${escapeHtml(item.category)}</td>

                <td class="${income ? "amount-income" : "amount-expense"}">
                    ${income ? "+" : "-"}${formatMoney(item.amount)}
                </td>

                <td>${escapeHtml(item.date)}</td>

                <td>${escapeHtml(item.description || "-")}</td>

                <td class="text-end">
                    <button class="action-btn edit-btn"
                            onclick="editTransaction('${item.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>

                    <button class="action-btn delete-btn"
                            onclick="deleteTransaction('${item.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

window.editTransaction = function(id) {
    const item = transactions.find(transaction =>
        transaction.id === id
    );

    if (!item) {
        return;
    }

    document.getElementById("transactionModalTitle").textContent =
        "Гүйлгээ засах";

    document.getElementById("transactionId").value =
        item.id;

    document.getElementById("transactionType").value =
        item.type;

    document.getElementById("transactionCategory").value =
        item.category;

    document.getElementById("transactionAmount").value =
        item.amount;

    document.getElementById("transactionDate").value =
        item.date;

    document.getElementById("transactionDescription").value =
        item.description || "";

    transactionModal.show();
};

window.deleteTransaction = async function(id) {
    const confirmed =
        confirm("Энэ гүйлгээг устгах уу?");

    if (!confirmed) {
        return;
    }

    const { error } = await supabaseClient
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id);

    if (error) {
        alert(error.message);
        return;
    }

    await loadData();
};

function resetTransactionForm() {
    transactionForm.reset();

    document.getElementById("transactionId").value = "";

    document.getElementById("transactionModalTitle").textContent =
        "Шинэ гүйлгээ";

    document.getElementById("transactionDate").value =
        new Date().toISOString().split("T")[0];
}

transactionModalElement.addEventListener(
    "hidden.bs.modal",
    resetTransactionForm
);

function renderBudgets() {
    const container =
        document.getElementById("budgetList");

    if (budgets.length === 0) {
        container.innerHTML = `
            <div class="text-muted small text-center py-3">
                Энэ сарын төсөв тохируулаагүй байна.
            </div>
        `;
        return;
    }

    container.innerHTML = budgets.map(budget => {
        const spent = getCategoryExpense(
            budget.category,
            budget.month_year
        );

        const limit = Number(budget.limit_amount);

        const percent = limit > 0
            ? Math.min((spent / limit) * 100, 100)
            : 0;

        let progressClass = "bg-success";

        if (percent >= 80) {
            progressClass = "bg-danger";
        } else if (percent >= 60) {
            progressClass = "bg-warning";
        }

        return `
            <div class="budget-item">

                <div class="budget-info">
                    <strong>${escapeHtml(budget.category)}</strong>

                    <span>
                        ${formatMoney(spent)} / ${formatMoney(limit)}
                    </span>
                </div>

                <div class="progress">
                    <div class="progress-bar ${progressClass}"
                         style="width:${percent}%">
                    </div>
                </div>

                <div class="small text-muted mt-1">
                    ${Math.round(percent)}% ашигласан
                </div>

            </div>
        `;
    }).join("");
}

function getCategoryExpense(category, monthYear) {
    return transactions
        .filter(item =>
            item.type === "зарлага" &&
            item.category === category &&
            item.date.startsWith(monthYear)
        )
        .reduce((sum, item) =>
            sum + Number(item.amount), 0);
}

function renderBadges() {
    const firstBadge =
        document.getElementById("badgeFirst");

    const masterBadge =
        document.getElementById("badgeMaster");

    const saverBadge =
        document.getElementById("badgeSaver");

    setBadge(firstBadge, transactions.length > 0);

    let master = false;

    if (budgets.length > 0) {
        master = budgets.every(budget => {
            const spent =
                getCategoryExpense(
                    budget.category,
                    budget.month_year
                );

            return spent <= Number(budget.limit_amount);
        });
    }

    setBadge(masterBadge, master);

    const currentMonth = getCurrentMonth();

    const monthlyIncome = transactions
        .filter(item =>
            item.type === "орлого" &&
            item.date.startsWith(currentMonth)
        )
        .reduce((sum, item) =>
            sum + Number(item.amount), 0);

    const monthlyExpense = transactions
        .filter(item =>
            item.type === "зарлага" &&
            item.date.startsWith(currentMonth)
        )
        .reduce((sum, item) =>
            sum + Number(item.amount), 0);

    const saver =
        monthlyIncome > 0 &&
        monthlyExpense < monthlyIncome * 0.5;

    setBadge(saverBadge, saver);
}

function setBadge(element, unlocked) {
    if (unlocked) {
        element.classList.remove("locked");
        element.classList.add("unlocked");
    } else {
        element.classList.add("locked");
        element.classList.remove("unlocked");
    }
}

function renderCharts() {
    renderCategoryChart();
    renderMonthlyChart();
}

function renderCategoryChart() {
    const currentMonth = getCurrentMonth();

    const expenses = transactions.filter(item =>
        item.type === "зарлага" &&
        item.date.startsWith(currentMonth)
    );

    const totals = {};

    expenses.forEach(item => {
        totals[item.category] =
            (totals[item.category] || 0) +
            Number(item.amount);
    });

    const labels = Object.keys(totals);
    const values = Object.values(totals);

    if (categoryChart) {
        categoryChart.destroy();
    }

    categoryChart = new Chart(
        document.getElementById("categoryChart"),
        {
            type: "doughnut",

            data: {
                labels,

                datasets: [{
                    data: values,
                    borderWidth: 0
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        position: "bottom"
                    }
                }
            }
        }
    );
}

function renderMonthlyChart() {
    const months = getLastSixMonths();

    const incomeData = [];
    const expenseData = [];

    months.forEach(month => {
        const income = transactions
            .filter(item =>
                item.type === "орлого" &&
                item.date.startsWith(month.key)
            )
            .reduce((sum, item) =>
                sum + Number(item.amount), 0);

        const expense = transactions
            .filter(item =>
                item.type === "зарлага" &&
                item.date.startsWith(month.key)
            )
            .reduce((sum, item) =>
                sum + Number(item.amount), 0);

        incomeData.push(income);
        expenseData.push(expense);
    });

    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart = new Chart(
        document.getElementById("monthlyChart"),
        {
            type: "bar",

            data: {
                labels: months.map(month => month.label),

                datasets: [
                    {
                        label: "Орлого",
                        data: incomeData
                    },
                    {
                        label: "Зарлага",
                        data: expenseData
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        }
    );
}

function getLastSixMonths() {
    const months = [];

    const formatter =
        new Intl.DateTimeFormat("mn-MN", {
            month: "short"
        });

    for (let i = 5; i >= 0; i--) {
        const date = new Date();

        date.setDate(1);
        date.setMonth(date.getMonth() - i);

        const key =
            `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}`;

        months.push({
            key,
            label: formatter.format(date)
        });
    }

    return months;
}

function getCurrentMonth() {
    const date = new Date();

    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
}

function formatMoney(value) {
    return "₮" +
        Number(value || 0)
            .toLocaleString("en-US");
}

function showAuthMessage(message, type) {
    authMessage.innerHTML = `
        <div class="alert alert-${type}">
            ${escapeHtml(message)}
        </div>
    `;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

async function initializeApp() {
    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    if (session) {
        currentUser = session.user;
        await showApp();
    }
}

initializeApp();