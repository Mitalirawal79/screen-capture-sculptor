Absolutely. Since Antigravity works best when it understands the product vision, I'd give it a complete product brief instead of just individual tasks.

\---

\# **SiteCrew** — Overall Project Context

\## Project Overview

SiteCrew is a workforce management application built specifically for \*\*small and medium civil contractors in India\*\*.

It is \*\*not\*\* intended to be a generic HR, payroll, or employee management system.

The primary users are contractors who manage multiple construction/interior sites simultaneously and need a fast, simple way to manage:

\* Workers

\* Construction sites (Projects)

\* Daily attendance

\* Labour cost

\* Wage payments

\* Excel reports

The application's philosophy is:

> \\\*\\\*Speed over complexity. A contractor should be able to complete daily attendance in under two minutes.\\\*\\\*

\---

\# Real World Workflow

The application is based on my father's real civil contracting business.

He manages multiple interior/construction sites simultaneously.

Example:

\* Motilal Oswal

\* Dadar

\* Central Park

\* Bandra

Every day workers may move between sites depending on workload.

This is extremely important.

Workers are \*\*NOT permanently attached to one project.\*\*

Example:

Monday

Motilal:

\* Rahul

\* Moksh

\* Arjun

Dadar:

\* Daya

\* Rakesh

Tuesday

Motilal:

\* Daya

\* Rahul

Dadar:

\* Moksh

\* Rakesh

Wednesday

Central Park:

\* Rahul

\* Arjun

\* Daya

Therefore SiteCrew should never assume that a worker permanently belongs to one project.

Attendance for a particular day determines where that worker worked.

\---

\# Target Users

The application is designed for contractors who typically manage:

\* 5–100 workers

\* Multiple active projects

\* Daily wage labour

\* Site supervisors

\* Monthly wage calculations

Users are generally \*\*not tech-savvy\*\*, so the interface must remain extremely simple.

\---

\# Current Technology

Frontend:

\* React

\* TypeScript

\* TanStack Router

Backend:

\* Supabase

Database:

\* PostgreSQL

Authentication:

\* Supabase Auth

Reports:

\* XLSX (SheetJS)

\---

\# Existing Modules

The application currently includes:

\## Home Dashboard

Displays contractor KPIs such as:

\* Active Projects

\* Total Workers

\* Today's Attendance

\* Labour Cost

\* Pending Payments

\---

\## Workers

Stores:

\* Name

\* Worker Type

\* Daily Wage

\* Status

Worker detail page shows:

\* Attendance history

\* Earnings

\* Payments

\---

\## Projects

Stores:

\* Project Name

\* Client

\* Location

\* Progress

\* Status

\---

\## Attendance

Allows marking:

\* Full Day

\* Half Day

\* Overtime

\* Absent

Attendance is currently project-based.

\---

\## Payments

Tracks payments made to workers.

\---

\## Reports

Generates monthly Excel reports.

\---

\# Design Philosophy

The UI has already been finalized.

Maintain:

\* Current layout

\* Current branding

\* Current navigation

\* Current colors

\* Current design language

Do not redesign the application.

Improve workflow only.

\---

\# Core Business Rules

\## Attendance Types

Absent

Multiplier = 0

Half Day

Multiplier = 0.5

Full Day

Multiplier = 1.0

Overtime

Multiplier = 1.5

Examples:

₹700/day

OT = ₹1050

₹1000/day

OT = ₹1500

₹2000/day

OT = ₹3000

These multipliers should be used consistently throughout:

\* Dashboard

\* Reports

\* Excel

\* Worker summaries

\* Labour cost

\* Earnings

\---

\# Worker Philosophy

Workers are a global resource.

Projects do not permanently own workers.

Workers may work on different projects on different days.

Attendance records determine:

\* Which project the worker worked on

\* Earnings

\* Labour cost

\* Reporting

\---

\# Preferred Attendance Workflow

The attendance flow should match how contractors actually work.

Daily workflow:

1\. Select Date

2\. Select Project

3\. Load the project's default team (optional)

4\. Allow adding/removing workers for today

5\. Mark attendance

6\. Save

This creates today's workforce for that site.

Tomorrow the same worker may be assigned to a different site.

\---

\# Default Team vs Daily Workforce

The existing `project\\\_workers` table should not represent permanent assignments.

Instead treat it as:

Default Team

Meaning:

When attendance opens:

Project:

Motilal Oswal

Default Team:

\* Rahul

\* Moksh

\* Arjun

These workers are preloaded.

The contractor can then:

\* Add Worker

Remove Worker

for that specific day only.

The attendance record becomes the source of truth.

\---

\# Project Detail Page

The project page should become a management dashboard.

Display:

Project Information

Today's Workforce

Workers who worked this month

Monthly Labour Cost

Attendance Summary

Project Progress

Quick Actions

Do not treat workers as permanently assigned.

\---

\# Worker Detail Page

Each worker should display:

Basic Information

Worker Type

Daily Wage

Attendance This Month

Projects Worked This Month

Total Earnings

Payments Received

Pending Amount

This provides a complete worker profile.

\---

\# Home Dashboard

The dashboard should focus on contractor insights.

Examples:

Today's Attendance

Today's Labour Cost

Monthly Labour Cost

Workers Present Today

Active Projects

Pending Payments

Site Status

For each project:

\* Workers Today

\* Present

\* Labour Cost

\* Progress

\---

\# Excel Reports

Reports are a major feature of this application.

The exported Excel file should resemble a traditional contractor attendance register.

Requirements include:

\* Workforce Summary sheet

\* Attendance Calendar sheet

\* Labour Cost Summary sheet

Attendance Calendar should display:

Worker Name

Daily Wage

Dates (1–30/31)

Attendance Codes

P

H

O

A

Color-coded cells

Monthly totals

The report should be immediately understandable to contractors who currently maintain paper attendance registers.

\---

\# Future Features (Planned)

The architecture should support future additions without major refactoring.

Planned features include:

\* Travel/Conveyance Allowance

\* Worker Expenses

\* Site-wise Material Tracking

\* Quotation Management

\* Client Billing

\* Weekly Reports

\* Salary Slips

\* Experience Letter Generator

\* Workforce Analytics

\* Notifications

\* Offline Mode

\* React Native mobile application

\---

\# Development Principles

Before implementing any feature:

\* Analyze the existing codebase.

\* Reuse existing components whenever possible.

\* Do not duplicate business logic.

\* Preserve existing database schema unless absolutely necessary.

\* Preserve existing Supabase integration.

\* Maintain backward compatibility with reports and calculations.

\* Prefer extending existing functionality over rewriting it.

\* Optimize for simplicity, speed, and real-world contractor workflows.

\---

\## Final Product Vision

\*\*SiteCrew is intended to become a lightweight ERP for civil contractors.\*\*

It should help contractors manage their \*\*daily workforce\*\*, \*\*site operations\*\*, \*\*labour costs\*\*, and \*\*payments\*\* with minimal effort while remaining simple enough that someone with little technical experience can use it confidently every day.

This is the vision that should guide every architectural and feature decision.
