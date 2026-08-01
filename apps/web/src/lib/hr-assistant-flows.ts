export type FlowAction = 'home' | 'escalate' | 'ticket' | 'link';

export type FlowOption = {
  label: string;
  nextId?: string;
  reply?: string;
  action?: FlowAction;
  link?: string;
};

export type FlowNode = {
  id: string;
  message: string;
  options?: FlowOption[];
  allowFreeText?: boolean;
};

export type CategoryCard = {
  id: string;
  icon: string;
  label: string;
  gradient: string;
  nextId: string;
};

export type FaqItem = {
  question: string;
  answer: string;
  tags: string[];
};

export const WELCOME_MESSAGE = `👋 Hello, Employee!

Welcome to HR Assistant.

I'm here to help you with attendance, salary, leave, documents, company policies, holidays, payroll, profile updates, and more.

Choose a topic below to get started.`;

export const CATEGORIES: CategoryCard[] = [
  { id: 'attendance', icon: '🟢', label: 'Attendance', gradient: 'from-emerald-500/20 to-teal-500/10', nextId: 'attendance-root' },
  { id: 'leave', icon: '🟡', label: 'Leave', gradient: 'from-amber-500/20 to-orange-500/10', nextId: 'leave-root' },
  { id: 'salary', icon: '💰', label: 'Salary & Payroll', gradient: 'from-violet-500/20 to-purple-500/10', nextId: 'salary-root' },
  { id: 'documents', icon: '📄', label: 'Documents', gradient: 'from-sky-500/20 to-blue-500/10', nextId: 'documents-root' },
  { id: 'policies', icon: '🏢', label: 'Company Policies', gradient: 'from-indigo-500/20 to-blue-500/10', nextId: 'policies-root' },
  { id: 'holidays', icon: '📅', label: 'Holiday Calendar', gradient: 'from-rose-500/20 to-pink-500/10', nextId: 'holidays-root' },
  { id: 'profile', icon: '👤', label: 'Profile', gradient: 'from-cyan-500/20 to-teal-500/10', nextId: 'profile-root' },
  { id: 'login', icon: '🔐', label: 'Login & Account', gradient: 'from-slate-500/20 to-gray-500/10', nextId: 'login-root' },
  { id: 'tech', icon: '🛠', label: 'Technical Support', gradient: 'from-orange-500/20 to-red-500/10', nextId: 'tech-root' },
  { id: 'announcements', icon: '📢', label: 'Announcements', gradient: 'from-fuchsia-500/20 to-purple-500/10', nextId: 'announcements-root' },
  { id: 'faq', icon: '❓', label: 'Frequently Asked Questions', gradient: 'from-brand-500/20 to-brand-600/10', nextId: 'faq-root' },
  { id: 'contact', icon: '📨', label: 'Contact HR', gradient: 'from-brand-600/20 to-indigo-500/10', nextId: 'contact-root' },
];

const ESCALATE: FlowOption[] = [
  { label: 'Contact HR', action: 'escalate' },
  { label: 'Raise Support Ticket', action: 'ticket' },
  { label: 'Back to Home', action: 'home' },
];

function leaf(id: string, message: string, extra?: FlowOption[]): FlowNode {
  return { id, message, options: [...(extra ?? []), ...ESCALATE] };
}

export const FLOW_NODES: Record<string, FlowNode> = {
  'attendance-root': {
    id: 'attendance-root',
    message: 'What do you need help with regarding attendance?',
    options: [
      { label: 'My attendance is absent', nextId: 'attendance-absent' },
      { label: 'Check-in failed', nextId: 'attendance-checkin-fail' },
      { label: 'Camera not opening', nextId: 'attendance-camera' },
      { label: 'GPS problem', nextId: 'attendance-gps' },
      { label: 'Forgot to check out', nextId: 'attendance-checkout' },
      { label: 'Attendance correction', nextId: 'attendance-correction' },
      { label: 'Late mark issue', nextId: 'attendance-late' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'attendance-correction': {
    id: 'attendance-correction',
    message: 'What happened with your attendance?',
    options: [
      { label: 'Forgot to mark attendance', nextId: 'attendance-corr-forgot' },
      { label: 'App was not working', nextId: 'attendance-corr-app' },
      { label: 'Camera issue', nextId: 'attendance-camera' },
      { label: 'GPS issue', nextId: 'attendance-gps' },
      { label: 'Internet problem', nextId: 'attendance-corr-net' },
      { label: 'Other', nextId: 'attendance-corr-other' },
      { label: 'Back', nextId: 'attendance-root' },
    ],
  },
  'attendance-corr-other': {
    id: 'attendance-corr-other',
    message: 'Please describe your attendance issue in detail. HR will review your request.',
    allowFreeText: true,
    options: [{ label: 'Back', nextId: 'attendance-correction' }],
  },
  'attendance-absent': leaf(
    'attendance-absent',
    'If you were present but marked absent, raise an attendance correction request from ESS → Attendance → Regularization. Include the date and reason. Your manager will approve before HR updates records.',
  ),
  'attendance-checkin-fail': leaf(
    'attendance-checkin-fail',
    'Check-in failures are usually caused by camera permissions, GPS, or network issues. Ensure location and camera access are enabled, refresh the page, and try again on stable internet.',
  ),
  'attendance-camera': leaf(
    'attendance-camera',
    'Allow camera permission in your browser or mobile app settings. Close other apps using the camera, then reload and punch again. If the issue persists, raise a technical support ticket.',
  ),
  'attendance-gps': leaf(
    'attendance-gps',
    'Enable high-accuracy location on your device and ensure you are within the office geo-fence. Move to an open area, disable battery saver, and retry check-in.',
  ),
  'attendance-checkout': leaf(
    'attendance-checkout',
    'If you forgot to check out, submit a regularization request for that date with your actual logout time. HR or your manager can approve the correction.',
  ),
  'attendance-late': leaf(
    'attendance-late',
    'Late marks follow company policy based on grace minutes and monthly limits. Repeated late marks may affect attendance incentives or convert to half-day as per policy.',
  ),
  'attendance-corr-forgot': leaf(
    'attendance-corr-forgot',
    'Submit attendance regularization for the missed date from ESS → Attendance. Select "Forgot to punch" and provide the correct in/out time.',
  ),
  'attendance-corr-app': leaf(
    'attendance-corr-app',
    'If the app failed during punch, note the time and raise a regularization request with a brief explanation. Attach a screenshot if available.',
  ),
  'attendance-corr-net': leaf(
    'attendance-corr-net',
    'Network issues during punch may not record attendance. Once connected, submit a regularization request with the approximate time you were present.',
  ),

  'leave-root': {
    id: 'leave-root',
    message: 'How can I help with leave?',
    options: [
      { label: 'Apply Leave', nextId: 'leave-apply' },
      { label: 'Leave Balance', nextId: 'leave-balance' },
      { label: 'Leave Rejected', nextId: 'leave-rejected' },
      { label: 'Leave Pending', nextId: 'leave-pending' },
      { label: 'Cancel Leave', nextId: 'leave-cancel' },
      { label: 'Leave Encashment', nextId: 'leave-encash' },
      { label: 'Paid Leave', nextId: 'leave-paid' },
      { label: 'Medical Leave', nextId: 'leave-medical' },
      { label: 'Casual Leave', nextId: 'leave-casual' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'leave-apply': leaf('leave-apply', 'Go to ESS → Leave → Apply. Select leave type, dates, and reason. Your manager will receive the request for approval.'),
  'leave-balance': leaf('leave-balance', 'View your current leave balance under ESS → Leave → Balance. Balances update after probation and monthly accrual as per company policy.'),
  'leave-rejected': leaf('leave-rejected', 'If leave was rejected, check the approver remarks in your leave history. You may re-apply with updated dates or contact your manager for clarification.'),
  'leave-pending': leaf('leave-pending', 'Pending leave awaits manager or HR approval. You can track status in ESS → Leave → My Requests.'),
  'leave-cancel': leaf('leave-cancel', 'To cancel approved future leave, open the leave request and choose Cancel before the leave start date, subject to policy.'),
  'leave-encash': leaf('leave-encash', 'Leave encashment is processed as per company policy, usually during exit or annual settlement. Contact HR for eligibility.'),
  'leave-paid': leaf('leave-paid', 'Paid leave (privilege/earned) is credited monthly after probation. Use it for planned time off through the leave module.'),
  'leave-medical': leaf('leave-medical', 'For medical leave, apply with appropriate dates. Upload medical certificate if required by policy for extended sick leave.'),
  'leave-casual': leaf('leave-casual', 'Casual leave is for short unplanned needs. Apply through ESS → Leave and await manager approval.'),

  'salary-root': {
    id: 'salary-root',
    message: 'What would you like to know about salary or payroll?',
    options: [
      { label: 'Salary not received', nextId: 'salary-not-received' },
      { label: 'Salary less than expected', nextId: 'salary-less' },
      { label: 'PF Details', nextId: 'salary-pf' },
      { label: 'TDS Details', nextId: 'salary-tds' },
      { label: 'Security Deposit', nextId: 'salary-sd' },
      { label: 'Payslip', nextId: 'salary-payslip' },
      { label: 'Bonus', nextId: 'salary-bonus' },
      { label: 'Incentive', nextId: 'salary-incentive' },
      { label: 'Overtime', nextId: 'salary-ot' },
      { label: 'Attendance impact', nextId: 'salary-attendance' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'salary-less': leaf(
    'salary-less',
    'Based on company payroll policy, your salary depends on attendance, leave, late marks, half days, PF, TDS, security deposit, and other deductions.\n\nWould you like to review your payslip under ESS → Payslips for a detailed breakdown?',
  ),
  'salary-not-received': leaf('salary-not-received', 'Salary is credited on the company payroll cycle after payroll is locked. If delayed beyond the usual date, verify bank details in your profile and contact HR with your employee code.'),
  'salary-pf': leaf('salary-pf', 'PF contributions appear on your payslip under deductions. UAN and PF account details are maintained by HR. Raise a ticket if amounts look incorrect.'),
  'salary-tds': leaf('salary-tds', 'TDS is deducted per income tax rules and your declared investments. Review the tax section on your payslip or update declarations during the investment window.'),
  'salary-sd': leaf('salary-sd', 'Security deposit policy varies by role and tenure. Check your offer letter or HR policy documents. Refund is typically processed during full & final settlement.'),
  'salary-payslip': leaf('salary-payslip', 'Download payslips from ESS → Payslips once payroll is published for the month.'),
  'salary-bonus': leaf('salary-bonus', 'Bonuses are announced by management and reflected in payroll when applicable. Check payslip notes or company announcements.'),
  'salary-incentive': leaf('salary-incentive', 'Attendance and performance incentives follow published policy. Eligibility depends on attendance metrics and company rules.'),
  'salary-ot': leaf('salary-ot', 'Overtime, if applicable, must be pre-approved by your manager and is paid per company overtime policy.'),
  'salary-attendance': leaf('salary-attendance', 'LOP, late marks, and half-days reduce payable days and affect net salary. Review attendance summary alongside your payslip.'),

  'documents-root': {
    id: 'documents-root',
    message: 'What do you need help with regarding documents?',
    options: [
      { label: 'Upload Document', nextId: 'doc-upload' },
      { label: 'Replace Document', nextId: 'doc-replace' },
      { label: 'Download Document', nextId: 'doc-download' },
      { label: 'Missing Document', nextId: 'doc-missing' },
      { label: 'Verification Pending', nextId: 'doc-verify' },
      { label: 'Required Joining Documents', nextId: 'doc-joining' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'doc-upload': leaf('doc-upload', 'Employees can view documents uploaded by HR under ESS → Documents. To submit new documents, share them with HR or use the upload option if enabled for your profile.'),
  'doc-replace': leaf('doc-replace', 'To replace an outdated document, contact HR with the updated file. HR will verify and update your employee record.'),
  'doc-download': leaf('doc-download', 'Open ESS → Documents, select the document, and use View or Download. Supported formats include PDF and images.'),
  'doc-missing': leaf('doc-missing', 'If a required document is missing from your profile, submit it to HR for upload. Joining kits typically list mandatory documents.'),
  'doc-verify': leaf('doc-verify', 'Verification pending means HR is reviewing your submission. You will be notified once approved or if resubmission is needed.'),
  'doc-joining': leaf('doc-joining', 'Common joining documents: Aadhaar, PAN, bank proof, educational certificates, and previous employment proofs. Confirm the exact list with HR.'),

  'policies-root': {
    id: 'policies-root',
    message: 'Which company policy would you like to know about?',
    options: [
      { label: 'Office Timing', nextId: 'policy-timing' },
      { label: 'Late Mark Policy', nextId: 'policy-late' },
      { label: 'ULOB Policy', nextId: 'policy-ulob' },
      { label: 'Leave Policy', nextId: 'policy-leave' },
      { label: 'Attendance Incentive', nextId: 'policy-incentive' },
      { label: 'WFH Policy', nextId: 'policy-wfh' },
      { label: 'Dress Code', nextId: 'policy-dress' },
      { label: 'Security Deposit Policy', nextId: 'policy-sd' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'policy-timing': leaf('policy-timing', 'Standard office hours are configured by your company (typically 9:30 AM – 6:30 PM with grace minutes). Check announcements or HR for your location-specific timing.'),
  'policy-late': leaf('policy-late', 'Late arrivals within grace minutes may not count as late. Excess late marks can lead to half-day or LOP per policy.'),
  'policy-ulob': leaf('policy-ulob', 'Uninformed leave on business (ULOB) or unapproved absence may attract disciplinary action. Always apply leave or inform your manager in advance.'),
  'policy-leave': leaf('policy-leave', 'Leave accrues after probation with monthly credits and carry-forward limits. Types include casual, sick, and privilege leave.'),
  'policy-incentive': leaf('policy-incentive', 'Full attendance without unapproved absence may qualify for monthly attendance incentive per published rules.'),
  'policy-wfh': leaf('policy-wfh', 'Work from home requires manager approval and must be marked as WFH in attendance where supported.'),
  'policy-dress': leaf('policy-dress', 'Follow business-appropriate attire on office days. Client-facing roles may have additional guidelines from HR.'),
  'policy-sd': leaf('policy-sd', 'Security deposit terms are outlined in your offer letter and HR policy handbook. Refund follows exit clearance.'),

  'holidays-root': {
    id: 'holidays-root',
    message: 'What would you like to know about holidays?',
    options: [
      { label: 'Holiday Calendar', nextId: 'holiday-cal', link: '/holidays' },
      { label: 'Company Holidays', nextId: 'holiday-company' },
      { label: 'Weekly Off', nextId: 'holiday-weekly' },
      { label: 'Optional Holidays', nextId: 'holiday-optional' },
      { label: 'Upcoming Holidays', nextId: 'holiday-upcoming' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'holiday-cal': leaf('holiday-cal', 'View the full holiday calendar under Holidays in the main menu. It lists national, regional, and company-specific holidays.'),
  'holiday-company': leaf('holiday-company', 'Company-declared holidays are published annually. They appear on the Holidays page and in ESS announcements.'),
  'holiday-weekly': leaf('holiday-weekly', 'Weekly offs (e.g. Saturday/Sunday) follow your work schedule configured in HRMS. Check your shift or roster if applicable.'),
  'holiday-optional': leaf('holiday-optional', 'Optional holidays may be availed from a limited list per policy. Apply through leave or holiday selection as guided by HR.'),
  'holiday-upcoming': leaf('holiday-upcoming', 'Open the Holidays page to see upcoming holidays sorted by date for planning leave around long weekends.'),

  'profile-root': {
    id: 'profile-root',
    message: 'Which profile detail do you need help updating?',
    options: [
      { label: 'Mobile Number', nextId: 'profile-mobile' },
      { label: 'Address', nextId: 'profile-address' },
      { label: 'Emergency Contact', nextId: 'profile-emergency' },
      { label: 'Personal Details', nextId: 'profile-personal' },
      { label: 'Bank Details', nextId: 'profile-bank' },
      { label: 'Nominee Details', nextId: 'profile-nominee' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'profile-mobile': leaf('profile-mobile', 'Update mobile number from ESS → Profile. Some fields may require HR verification before they reflect in payroll communications.'),
  'profile-address': leaf('profile-address', 'Current and permanent address can be updated in your profile. Ensure pin code and state are accurate for statutory records.'),
  'profile-emergency': leaf('profile-emergency', 'Keep emergency contact name, relationship, and phone number current in ESS → Profile for safety compliance.'),
  'profile-personal': leaf('profile-personal', 'Personal details such as date of birth and marital status are managed in your profile. Contact HR for corrections to verified identity fields.'),
  'profile-bank': leaf('profile-bank', 'Bank account changes require updated cancelled cheque or bank proof. Submit to HR for verification to avoid salary transfer failures.'),
  'profile-nominee': leaf('profile-nominee', 'Nominee details for PF/gratuity insurance should be kept updated. HR can guide on required nomination forms.'),

  'login-root': {
    id: 'login-root',
    message: 'What login or account issue are you facing?',
    options: [
      { label: 'Login Issue', nextId: 'login-issue' },
      { label: 'Password Reset', nextId: 'login-password' },
      { label: 'Account Locked', nextId: 'login-locked' },
      { label: 'Username / Employee ID', nextId: 'login-username' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'login-issue': leaf('login-issue', 'Use your Employee ID and password on the login page. Clear browser cache or try incognito if credentials are correct but login fails.'),
  'login-password': leaf('login-password', 'Use Forgot Password on the login screen or contact HR to reset your password securely.'),
  'login-locked': leaf('login-locked', 'Accounts lock after repeated failed attempts. Wait for the cooldown period or contact HR to unlock your account.'),
  'login-username': leaf('login-username', 'Your username is typically your Employee Code assigned by HR. It is shown on your profile and payslip.'),

  'tech-root': {
    id: 'tech-root',
    message: 'Select your technical issue:',
    options: [
      { label: 'Login Issue', nextId: 'login-issue' },
      { label: 'Password Reset', nextId: 'login-password' },
      { label: 'Attendance Camera Issue', nextId: 'attendance-camera' },
      { label: 'GPS Issue', nextId: 'attendance-gps' },
      { label: 'File Upload Issue', nextId: 'tech-upload' },
      { label: 'Slow Application', nextId: 'tech-slow' },
      { label: 'App Not Opening', nextId: 'tech-app' },
      { label: 'Other', nextId: 'tech-other' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
  'tech-upload': leaf('tech-upload', 'Ensure file size is within limits and format is PDF/JPG/PNG. Try a stable connection and a different browser if upload fails.'),
  'tech-slow': leaf('tech-slow', 'Slow performance may be due to network or device memory. Refresh the page, close unused tabs, and retry on broadband if possible.'),
  'tech-app': leaf('tech-app', 'If the app does not open, update your browser, disable extensions, or try another device. Raise an IT ticket if the issue continues.'),
  'tech-other': { id: 'tech-other', message: 'Describe your technical issue below.', allowFreeText: true, options: [{ label: 'Back', nextId: 'tech-root' }] },

  'announcements-root': leaf(
    'announcements-root',
    'Company announcements appear on your dashboard and notifications. Check regularly for policy updates, holiday notices, and payroll dates.',
  ),

  'faq-root': {
    id: 'faq-root',
    message: 'Browse popular topics or use search above. Select a category:',
    options: [
      { label: 'Attendance FAQs', nextId: 'faq-attendance' },
      { label: 'Salary FAQs', nextId: 'faq-salary' },
      { label: 'Leave FAQs', nextId: 'faq-leave' },
      { label: 'Exit & F&F FAQs', nextId: 'faq-exit' },
      { label: 'Back to Home', action: 'home' },
    ],
  },

  'contact-root': {
    id: 'contact-root',
    message: 'How would you like to reach HR?',
    options: [
      { label: 'Raise Support Ticket', action: 'ticket' },
      { label: 'Send Message to HR', action: 'escalate' },
      { label: 'Email HR', action: 'escalate' },
      { label: 'Back to Home', action: 'home' },
    ],
  },
};

function buildFaqNodes() {
  const topicMeta: { key: string; letter: string; label: string }[] = [
    { key: 'attendance', letter: 'a', label: 'attendance' },
    { key: 'salary', letter: 's', label: 'salary' },
    { key: 'leave', letter: 'l', label: 'leave' },
    { key: 'exit', letter: 'e', label: 'exit' },
  ];
  for (const { key, letter } of topicMeta) {
    const items = FAQ_BY_TOPIC[key] ?? [];
    FLOW_NODES[`faq-${key}`] = {
      id: `faq-${key}`,
      message: `Top ${key} questions — pick one or search:`,
      options: items
        .map((f, i) => ({
          label: f.question.length > 48 ? `${f.question.slice(0, 48)}…` : f.question,
          nextId: `faq-${letter}-${i}`,
        }))
        .concat([{ label: 'Back', nextId: 'faq-root' }]),
    };
    items.forEach((item, i) => {
      FLOW_NODES[`faq-${letter}-${i}`] = leaf(`faq-${letter}-${i}`, `${item.question}\n\n${item.answer}`);
    });
  }
}

const FAQ_TEMPLATES: { topic: string; tags: string[]; questions: string[]; answer: string }[] = [
  { topic: 'attendance', tags: ['attendance', 'punch'], questions: ['How do I mark attendance?', 'Why am I marked absent?', 'Can I regularize attendance?', 'What is grace time?', 'How many late marks are allowed?', 'What is half day rule?', 'How does WFH attendance work?', 'Why did check-in fail?', 'How to fix GPS error?', 'Camera not working for punch'], answer: 'Use ESS → Attendance to punch or regularize. Follow company grace, late mark, and geo-fence rules. Contact HR for corrections with manager approval.' },
  { topic: 'salary', tags: ['salary', 'payroll', 'pf', 'tds'], questions: ['When is salary credited?', 'Why is my salary less?', 'How to download payslip?', 'What is PF deduction?', 'What is TDS?', 'How is LOP calculated?', 'Bonus payment date?', 'Overtime payment rules?', 'Salary hold reasons?', 'How to update bank account?'], answer: 'Salary is processed per payroll cycle after attendance lock. Review payslip for earnings and deductions. Update bank details through HR verification.' },
  { topic: 'leave', tags: ['leave', 'balance'], questions: ['How to apply leave?', 'Check leave balance?', 'Leave rejected what to do?', 'Cancel approved leave?', 'Sick leave certificate needed?', 'Privilege leave rules?', 'Casual leave limit?', 'Leave during notice period?', 'Comp off eligibility?', 'Leave encashment rules?'], answer: 'Apply leave via ESS → Leave. Balance accrues per policy after probation. Manager approval is required for most leave types.' },
  { topic: 'documents', tags: ['document', 'upload'], questions: ['How to upload documents?', 'Download my offer letter?', 'Replace PAN card copy?', 'Document verification status?', 'Required joining documents?', 'Missing document in profile?'], answer: 'View and download documents under ESS → Documents. Submit updates to HR for upload and verification.' },
  { topic: 'profile', tags: ['profile', 'bank'], questions: ['Update mobile number?', 'Change address?', 'Emergency contact update?', 'Nominee update process?', 'Correct name spelling?', 'Update email address?'], answer: 'Edit allowed fields in ESS → Profile. Statutory or verified fields may need HR approval and supporting documents.' },
  { topic: 'policies', tags: ['policy', 'wfh'], questions: ['Office timing?', 'Late mark policy?', 'WFH policy?', 'Dress code?', 'ULOB meaning?', 'Attendance incentive rules?', 'Security deposit refund?', 'Probation period rules?'], answer: 'Company policies are published by HR. Refer to the policy handbook, announcements, or ask HR for location-specific rules.' },
  { topic: 'login', tags: ['login', 'password'], questions: ['Forgot password?', 'Account locked?', 'Invalid employee ID?', 'First time login?', 'Change password?', '2FA setup?'], answer: 'Use Employee ID to log in. Reset password via Forgot Password or contact HR. Keep credentials confidential.' },
  { topic: 'benefits', tags: ['benefits', 'insurance'], questions: ['Health insurance coverage?', 'Add dependents to insurance?', 'Gratuity eligibility?', 'PF withdrawal process?', 'ESI benefits?', 'Meal card or allowances?'], answer: 'Benefits depend on company programs and tenure. Contact HR for enrollment, dependents, and claim procedures.' },
  { topic: 'joining', tags: ['joining', 'onboarding'], questions: ['Joining formalities?', 'When do I get employee ID?', 'Probation duration?', 'Training schedule?', 'Laptop allocation?', 'ID card process?'], answer: 'HR coordinates onboarding, credentials, and asset allocation. Complete all joining documents promptly.' },
  { topic: 'exit', tags: ['resignation', 'fnf', 'exit'], questions: ['How to resign?', 'Notice period duration?', 'Exit clearance steps?', 'Full and final settlement?', 'Experience letter timeline?', 'Relieving letter download?', 'Recover security deposit?', 'Last working day rules?'], answer: 'Submit resignation via Exit module. Complete clearance tasks. F&F and letters are issued after HR and finance sign-off.' },
];

function expandFaqs(): FaqItem[] {
  const items: FaqItem[] = [];
  for (const block of FAQ_TEMPLATES) {
    for (const q of block.questions) {
      items.push({ question: q, answer: block.answer, tags: block.tags });
    }
    const extras = [
      `What is the policy for ${block.topic}?`,
      `Who approves ${block.topic} requests?`,
      `How long does ${block.topic} processing take?`,
      `Common issues with ${block.topic}?`,
      `Where to track ${block.topic} status?`,
    ];
    for (const q of extras) {
      items.push({ question: q, answer: block.answer, tags: block.tags });
    }
  }
  return items;
}

export const FAQ_ITEMS: FaqItem[] = expandFaqs();

export const FAQ_BY_TOPIC: Record<string, FaqItem[]> = {
  attendance: FAQ_ITEMS.filter((f) => f.tags.includes('attendance')),
  salary: FAQ_ITEMS.filter((f) => f.tags.some((t) => ['salary', 'payroll', 'pf', 'tds'].includes(t))),
  leave: FAQ_ITEMS.filter((f) => f.tags.includes('leave')),
  exit: FAQ_ITEMS.filter((f) => f.tags.some((t) => ['resignation', 'fnf', 'exit'].includes(t))),
};

buildFaqNodes();

export function getFlowNode(id: string): FlowNode | undefined {
  return FLOW_NODES[id];
}

export function searchFaq(query: string, limit = 8): FaqItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FAQ_ITEMS.filter(
    (f) =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      f.tags.some((t) => t.includes(q)),
  ).slice(0, limit);
}

export function searchCategories(query: string): CategoryCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATEGORIES;
  return CATEGORIES.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
}
