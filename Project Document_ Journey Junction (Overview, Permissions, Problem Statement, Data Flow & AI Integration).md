## **Project Document: Journey Junction (Overview, Permissions, Problem Statement, Data Flow & AI Integration)**

### **1\. Problem Statement**

Traditional vehicle rental markets often suffer from fragmented local operations, lack of trust due to unverified fleet owners, cumbersome manual payment tracking, and a lack of personalized recommendations. Customers struggle to find reliable 2-wheeler and 4-wheeler rentals across different states and cities with transparent pricing and instant support. Fleet owners face high overhead costs and complex platform fee structures.

**Journey Junction** solves these challenges by providing a centralized, mobile-responsive web platform featuring secure digital KYC verification for both users and merchants, a commission-based monetization model (30% platform cut / 70% merchant payout), a two-stage manual UPI payment workflow, and an AI-driven assistant for instant user queries and personalized vehicle recommendations.

### **2\. Tech Stack**

* **Frontend:** Next.js  
* **Backend:** Express.js  
* **Database:** PostgreSQL  
* **AI Integration:** Google Gemini LLM API (for chatbot support and personalized recommendations)

### **3\. System Permissions & Role Matrix**

#### **Super Admin**

* **Permissions & Access:** Full platform oversight across all modules.  
* **Capabilities:**  
  * Approve or reject merchant and user KYC submissions (displaying an official "Approved" status across the platform).  
  * Monitor all merchants, users, vehicles, and bookings across multiple states and cities.  
  * Manually verify and accept UPI payments for both the 50% advance and 50% balance stages.  
  * Track financial transactions, platform commissions (30%), and merchant payouts (70%).

#### **Merchant (Fleet Owner)**

* **Permissions & Access:** Restricted to own fleet and booking management following admin KYC approval.  
* **Capabilities:**  
  * Register using an email address and password; submit business and identity documents for KYC.  
  * List, edit, delete, and modify unlimited vehicles (categorized as 2-wheelers or 4-wheelers) once the account status is "Approved".  
  * Set daily rental pricing and create promotional offers/discounts.  
  * View incoming booking reservations, track rental statuses, and monitor earnings post-commission deduction.

#### **User (Customer)**

* **Permissions & Access:** Public discovery, booking, and profile management.  
* **Capabilities:**  
  * Register and log in via email and password.  
  * Complete mandatory KYC by submitting necessary identification documentation (such as identity card details and document uploads) and a valid Driving Licence.  
  * Search and filter vehicles by city, state, type (2-wheeler/4-wheeler), seating capacity, price per day, and verify the merchant's "Approved" status.  
  * View active and previous booking histories.  
  * Interact with the AI chatbot for instant answers regarding vehicle specs, pricing, and booking timelines.  
  * Receive personalized vehicle recommendations based on past bookings, seating preferences, and pricing trends.

### **4\. Data & Information Architecture**

* **User Data:** Stores profile details, secure authentication credentials, identification records, document URLs, and KYC verification status.  
* **Merchant Data:** Stores business profile, location details (state and city), authentication info, KYC document references, and the verified "Approved" status flag.  
* **Vehicle Data:** Maintains fleet attributes including title, category (2-wheeler/4-wheeler), seating capacity, per-day pricing, descriptions, images, and availability flags linked to specific approved merchants.  
* **Booking & Financial Data:** Tracks reservation dates, total rental amounts, two-stage payment statuses (Pending Advance, Advance Paid, Fully Paid), booking lifecycle statuses, calculated platform commission (30%), and merchant payout shares (70%).

### **5\. AI Integrations & Functionality**

Journey Junction integrates Google Gemini LLM APIs to elevate user engagement and decision-making without incurring high operational costs:

* **AI Customer Support Chatbot:** An embedded assistant trained on platform policies, vehicle details, and booking guidelines to answer user inquiries instantly.  
* **Personalized Recommendation Engine:** Analyzes user history, preferred vehicle types, seating capacity requirements, and budget patterns to surface the most relevant vehicle listings and trusted merchants.

