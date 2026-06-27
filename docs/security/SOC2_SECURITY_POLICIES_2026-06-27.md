# SOC 2 Type II Security Policies

**Datum:** 27. Juni 2026  
**Zweck:** Security Policies für SOC 2 Type II Zertifizierungsvorbereitung  
**Status:** Entwurf – vor Launch externer Audit erforderlich

---

# 1. Information Security Policy

## 1.1 Purpose

This policy establishes the framework for Subsumio's information security program to ensure the confidentiality, integrity, and availability of customer data in accordance with SOC 2 Type II requirements.

## 1.2 Scope

This policy applies to:

- All Subsumio employees, contractors, and third parties with access to Subsumio systems
- All Subsumio systems, applications, data, and infrastructure
- All customer data processed by Subsumio

## 1.3 Policy Statement

Subsumio is committed to:

- Protecting customer data from unauthorized access, use, disclosure, alteration, or destruction
- Maintaining the security and integrity of all systems and data
- Ensuring business continuity and availability of services
- Complying with applicable laws, regulations, and contractual obligations
- Continuously improving the information security program

## 1.4 Roles and Responsibilities

- **CEO:** Ultimate responsibility for information security
- **CTO:** Overall responsibility for security architecture and implementation
- **Security Lead:** Day-to-day security operations and compliance
- **All Employees:** Responsibility to follow security policies and report incidents

---

# 2. Access Control Policy

## 2.1 Purpose

To ensure that access to Subsumio systems and data is granted only to authorized individuals and based on the principle of least privilege.

## 2.2 Access Principles

- **Least Privilege:** Users are granted only the minimum access required to perform their job functions
- **Need-to-Know:** Access to sensitive data is restricted to those with a legitimate business need
- **Separation of Duties:** Critical functions are separated to prevent fraud and error
- **Multi-Factor Authentication (MFA):** All administrative access requires MFA
- **Regular Review:** Access rights are reviewed quarterly

## 2.3 User Access Management

### 2.3.1 Provisioning

- New user access requires manager approval
- Access is granted based on role and job function
- Default passwords are not issued; users set their own passwords
- Access is documented in the access log

### 2.3.2 De-provisioning

- Access is revoked immediately upon termination or role change
- De-provisioning is documented in the access log
- Offboarding checklist is completed for all departing employees

### 2.3.3 Access Review

- Access rights are reviewed quarterly
- Inactive accounts are disabled after 90 days
- Dormant accounts are deleted after 180 days

## 2.4 System Access Control

- Administrative access requires MFA (TOTP)
- Root access is restricted to authorized personnel only
- SSH access requires key-based authentication
- IP allow-listing is enforced for administrative access
- All administrative access is logged and audited

## 2.5 Third-Party Access

- Third-party access requires a written agreement
- Access is granted only for the duration of the contract
- Third-party access is monitored and logged
- Access is revoked immediately upon contract termination

---

# 3. Data Classification Policy

## 3.1 Purpose

To ensure that data is classified according to its sensitivity and protected accordingly.

## 3.2 Classification Levels

### 3.2.1 Public

- Definition: Information that can be freely disclosed to the public
- Examples: Marketing materials, public website content
- Protection: No special protection required

### 3.2.2 Internal

- Definition: Information intended for internal use only
- Examples: Internal documentation, project plans
- Protection: Access restricted to employees and contractors

### 3.2.3 Confidential

- Definition: Information that could cause harm if disclosed
- Examples: Customer data, financial information, source code
- Protection: Access restricted to authorized personnel; encryption at rest and in transit

### 3.2.4 Restricted

- Definition: Highly sensitive information requiring special protection
- Examples: Encryption keys, secrets, audit logs
- Protection: Strict access controls; encryption at rest and in transit; audit logging

## 3.3 Data Handling

- All customer data is classified as Confidential or Restricted
- Data is encrypted at rest using AES-256-GCM
- Data is encrypted in transit using TLS 1.3
- Data retention follows legal and contractual requirements
- Data is securely deleted upon request or contract termination

---

# 4. Incident Response Policy

## 4.1 Purpose

To establish a structured approach for detecting, responding to, and recovering from security incidents.

## 4.2 Incident Classification

### 4.2.1 Low

- Definition: Minor security events with minimal impact
- Response Time: 24 hours
- Examples: Failed login attempts, minor misconfigurations

### 4.2.2 Medium

- Definition: Security events with moderate impact
- Response Time: 8 hours
- Examples: Unauthorized access attempts, malware detection

### 4.2.3 High

- Definition: Security events with significant impact
- Response Time: 4 hours
- Examples: Data breach, system compromise, ransomware

### 4.2.4 Critical

- Definition: Security events with severe impact
- Response Time: 1 hour
- Examples: Complete system outage, large-scale data breach

## 4.3 Incident Response Process

### 4.3.1 Detection

- Monitoring systems detect potential incidents
- Employees report suspected incidents to security@subsum.io
- Automated alerts are generated for high-severity events

### 4.3.2 Containment

- Immediate actions to limit the impact
- Isolation of affected systems
- Temporary suspension of affected services if necessary

### 4.3.3 Eradication

- Root cause analysis
- Removal of malicious code or actors
- Patching of vulnerabilities

### 4.3.4 Recovery

- Restoration of systems from clean backups
- Verification of system integrity
- Resumption of normal operations

### 4.3.5 Post-Incident Review

- Documentation of the incident
- Lessons learned and recommendations
- Update of security policies and procedures

## 4.4 Notification

- Customers are notified within 72 hours of confirmed data breach
- Regulatory authorities are notified as required by law
- Internal stakeholders are notified according to severity

---

# 5. Change Management Policy

## 5.1 Purpose

To ensure that all changes to systems and applications are controlled, tested, and documented.

## 5.2 Change Classification

### 5.2.1 Standard

- Definition: Pre-authorized, low-risk changes
- Examples: Routine patches, configuration updates
- Approval: Automated or pre-approved
- Testing: Automated testing

### 5.2.2 Normal

- Definition: Changes requiring review and approval
- Examples: Feature deployments, infrastructure changes
- Approval: Change Advisory Board (CAB)
- Testing: Full testing in staging environment

### 5.2.3 Emergency

- Definition: Urgent changes to address critical issues
- Examples: Security patches, incident response
- Approval: Emergency approval process
- Testing: Minimal testing, rollback plan required

## 5.3 Change Process

1. **Request:** Change request submitted with justification and risk assessment
2. **Review:** Change reviewed by CAB (for normal changes)
3. **Approval:** Change approved or rejected
4. **Testing:** Change tested in staging environment
5. **Deployment:** Change deployed to production
6. **Verification:** Change verified in production
7. **Documentation:** Change documented in change log

## 5.4 Rollback

- All changes must have a documented rollback plan
- Rollback is initiated if deployment fails or causes issues
- Rollback is tested in staging environment

---

# 6. Business Continuity Policy

## 6.1 Purpose

To ensure the continuity of critical business operations in the event of a disruption.

## 6.2 Business Impact Analysis

- Critical systems are identified and prioritized
- Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) are defined
- Maximum Tolerable Downtime (MTD) is established

## 6.3 Backup Strategy

- Database backups are taken daily and retained for 30 days
- Weekly full backups are retained for 1 year
- Backups are encrypted and stored in a separate geographic location
- Backup integrity is verified monthly
- Restoration is tested quarterly

## 6.4 Disaster Recovery

- Disaster Recovery Plan (DRP) is documented and tested annually
- Alternative infrastructure is available for failover
- Key personnel are trained on DR procedures
- Communication plan is established for stakeholders

## 6.5 RTO and RPO

| System          | RTO     | RPO        |
| --------------- | ------- | ---------- |
| Web Application | 4 hours | 1 hour     |
| Database        | 2 hours | 15 minutes |
| Engine API      | 4 hours | 1 hour     |
| Authentication  | 2 hours | 15 minutes |

---

# 7. Vendor Management Policy

## 7.1 Purpose

To ensure that third-party vendors meet Subsumio's security requirements.

## 7.2 Vendor Assessment

- Security questionnaire is completed for all vendors
- Risk assessment is performed based on data access
- Due diligence is conducted for high-risk vendors

## 7.3 Vendor Agreements

- Data Processing Agreement (DPA) is required for all vendors processing customer data
- Security requirements are included in vendor contracts
- Right to audit is included for high-risk vendors

## 7.4 Vendor Monitoring

- Vendor performance is reviewed quarterly
- Security incidents are tracked and addressed
- Vendor access is monitored and logged

---

# 8. Acceptable Use Policy

## 8.1 Purpose

To define acceptable use of Subsumio systems and resources.

## 8.2 Acceptable Use

- Use systems for authorized business purposes only
- Protect passwords and authentication credentials
- Report security incidents promptly
- Comply with all applicable laws and regulations

## 8.3 Unacceptable Use

- Unauthorized access to systems or data
- Use of systems for personal gain
- Installation of unauthorized software
- Sharing of credentials
- Circumvention of security controls

## 8.4 Enforcement

- Violations are investigated and documented
- Disciplinary action is taken for policy violations
- Legal action is taken for criminal violations

---

# 9. Encryption Policy

## 9.1 Purpose

To ensure that sensitive data is encrypted to protect confidentiality.

## 9.2 Encryption Standards

- **At Rest:** AES-256-GCM
- **In Transit:** TLS 1.3
- **Key Management:** AES-256 keys stored in environment variables
- **Password Hashing:** scrypt with appropriate work factor

## 9.3 Encryption Implementation

- All customer data is encrypted at rest
- All network communications use TLS 1.3
- Encryption keys are rotated annually
- Weak ciphers and protocols are disabled

## 9.4 Key Management

- Encryption keys are generated using cryptographically secure methods
- Keys are stored in environment variables, not in code
- Key access is restricted to authorized personnel
- Key rotation is documented in the key log

---

# 10. Monitoring and Logging Policy

## 10.1 Purpose

To ensure that security events are detected, logged, and monitored.

## 10.2 Logging

- All administrative access is logged
- All authentication attempts are logged
- All API calls are logged
- All system errors are logged
- Logs are retained for 90 days

## 10.3 Monitoring

- Security events are monitored in real-time
- Alerts are generated for high-severity events
- Anomaly detection is enabled for unusual activity
- System performance is monitored continuously

## 10.4 Log Analysis

- Logs are reviewed daily for security events
- Trends are analyzed monthly
- Incidents are investigated promptly
- Log analysis is documented in incident reports

---

# 11. Physical Security Policy

## 11.1 Purpose

To ensure the physical security of Subsumio's infrastructure.

## 11.2 Data Center Security

- Data centers are SOC 2 Type II certified (Hetzner EU)
- Access to data centers is restricted to authorized personnel
- Video surveillance is in place
- Environmental controls are monitored

## 11.3 Office Security

- Access to offices is controlled
- Visitors are logged and escorted
- Workstations are locked when unattended
- Sensitive documents are stored in locked cabinets

## 11.4 Device Security

- Company devices are encrypted
- Mobile device management (MDM) is implemented
- Lost or stolen devices are reported immediately
- Remote wipe is enabled for mobile devices

---

# 12. Training and Awareness Policy

## 12.1 Purpose

To ensure that all employees are trained on security policies and procedures.

## 12.2 Training Program

- Security awareness training is provided upon hire
- Annual security refresher training is mandatory
- Role-specific training is provided for privileged users
- Phishing simulations are conducted quarterly

## 12.3 Training Content

- Information security policies
- Phishing and social engineering
- Password security
- Incident reporting
- Data handling procedures

## 12.4 Training Records

- Training completion is documented
- Training effectiveness is evaluated
- Additional training is provided as needed

---

# 13. Compliance Policy

## 13.1 Purpose

To ensure compliance with applicable laws, regulations, and standards.

## 13.2 Applicable Regulations

- GDPR (General Data Protection Regulation)
- DSG (Swiss Federal Data Protection Act)
- BDSG (German Federal Data Protection Act)
- DSGVO (Austrian Data Protection Act)

## 13.3 Compliance Activities

- Annual compliance review is conducted
- Gap analysis is performed against SOC 2 Type II requirements
- Remediation plans are developed and tracked
- Compliance status is reported to management

## 13.4 Certifications

- SOC 2 Type II certification is in progress
- ISO 27001 certification is planned
- Annual audits are conducted by external auditors

---

# 14. Policy Review and Maintenance

## 14.1 Review Cycle

- All policies are reviewed annually
- Policies are updated as needed to address changes in technology, regulations, or business requirements
- Policy changes are communicated to all affected personnel

## 14.2 Policy Approval

- All policies must be approved by the CTO and CEO
- Policy changes must be documented in the change log
- Policy effectiveness is reviewed quarterly

## 14.3 Policy Distribution

- Policies are published in the internal knowledge base
- All employees are notified of policy changes
- Training is provided for new or updated policies

---

# 15. Contact Information

- **Security Team:** security@subsum.io
- **Incident Response:** incident@subsum.io
- **Data Protection Officer:** dpo@subsum.io (to be appointed)
- **CTO:** cto@subsum.io

---

**Policy Owner:** CTO  
**Approval Date:** 27. Juni 2026  
**Next Review Date:** 27. Juni 2027

---

**Hinweis:** Diese Policies sind ein Entwurf für die SOC 2 Type II Vorbereitung. Vor Launch ist ein externer Audit durch einen zertifizierten Auditor erforderlich.
