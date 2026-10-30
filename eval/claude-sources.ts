// Twelve sources written in this repo's build session by Claude Opus 5.5,
// asked for "typical AI-assistant prose" in each genre. Em dashes are written
// as \u{2014} escapes so the repo itself contains none.
import type { Source } from "./corpus";

const EM = "\u{2014}";

export const CLAUDE_SOURCES: Omit<Source, "generator">[] = [
  {
    id: "c01-email-onboarding",
    genre: "work email",
    tone: "professional",
    prompt: "Write a welcome email to a new hire in typical AI-assistant style, about 130 words.",
    text: `Hi Jordan,

Welcome to the team! We're thrilled to have you on board and can't wait to see the unique perspective you'll bring to our growing organization. Your first week is designed to help you hit the ground running ${EM} from meeting key stakeholders to getting familiar with our tools and processes.

On Monday, you'll start with a comprehensive orientation session at 9:30 a.m., followed by lunch with your onboarding buddy, Maria Lopez. Throughout the week, you'll also have the opportunity to shadow team members, explore our documentation, and set up your development environment.

Please don't hesitate to reach out if you have any questions along the way. We're here to support you every step of the journey. Once again, welcome aboard!

Best regards,
Sam`,
  },
  {
    id: "c02-essay-social-media",
    genre: "essay",
    tone: "neutral",
    prompt: "Write an essay paragraph on social media and teenagers in typical AI-assistant style, about 150 words.",
    text: `In today's digital age, social media has become an integral part of teenagers' lives, shaping how they communicate, learn, and see themselves. Platforms like Instagram and TikTok offer a powerful space for creativity and connection, allowing young people to share their voices with the world. However, it's important to recognize that these benefits come with significant challenges. Constant exposure to curated images can foster unrealistic expectations, fueling anxiety and low self-esteem. Moreover, the endless scroll is designed to capture attention, often at the expense of sleep and face-to-face relationships. Ultimately, social media is not inherently good or bad ${EM} it is a tool whose impact depends on how it is used. By fostering digital literacy and encouraging healthy boundaries, parents and educators can help teenagers navigate this complex landscape and harness its potential for good.`,
  },
  {
    id: "c03-product-headphones",
    genre: "product copy",
    tone: "casual",
    prompt: "Write product copy for wireless headphones in typical AI-assistant style, about 110 words.",
    text: `Elevate your listening experience with the AuraSound X2 wireless headphones. Designed for those who demand more from their music, the X2 delivers rich, immersive sound that brings every note to life. With up to 40 hours of battery life, you can enjoy your favorite playlists from sunrise to sunset and beyond. Advanced noise cancellation lets you escape the chaos of your daily commute, while plush memory-foam ear cushions ensure all-day comfort. Whether you're working, traveling, or simply unwinding, the X2 seamlessly adapts to your lifestyle. It's not just a pair of headphones ${EM} it's your gateway to a world of sound. Experience the difference today.`,
  },
  {
    id: "c04-reddit-job-advice",
    genre: "forum post",
    tone: "casual",
    prompt: "Write a Reddit reply giving advice on a first job in typical AI-assistant style, about 140 words.",
    text: `Great question, and congrats on landing your first job! Starting a new role can feel overwhelming, but here are a few things that really helped me navigate those early months.

First, don't be afraid to ask questions. Nobody expects you to know everything on day one, and asking thoughtful questions actually shows that you're engaged and eager to learn. Second, take notes religiously. You'll be absorbing a ton of information, and having a reference will save you countless headaches down the road. Third, focus on building genuine relationships with your coworkers. Those connections will be invaluable throughout your career.

Ultimately, remember that everyone was new once. Be patient with yourself, stay curious, and embrace the learning process. You've got this!`,
  },
  {
    id: "c05-report-sales",
    genre: "business report",
    tone: "professional",
    prompt: "Write a short sales report summary in typical AI-assistant style with specific numbers, about 130 words.",
    text: `The third quarter marked a pivotal period of growth for the Northeast region. Total revenue reached $4.2 million, representing a 12% increase compared to the same period last year. This impressive performance was driven by several key factors, including the successful launch of our premium subscription tier, enhanced customer retention efforts, and a strategic expansion into two new markets.

Notably, customer churn decreased from 8.1% to 6.4%, underscoring the effectiveness of our renewed focus on customer success. However, it is worth noting that acquisition costs rose by 9%, highlighting the need for more efficient marketing strategies moving forward. Overall, the results demonstrate strong momentum and position the region well for continued success in the fourth quarter.`,
  },
  {
    id: "c06-college-why-major",
    genre: "college short answer",
    tone: "neutral",
    prompt: "Write a college short answer about why the student wants to study computer science, typical AI style, using [placeholders] for personal details, about 150 words.",
    text: `Ever since I wrote my first line of code in [grade or age], I have been fascinated by the power of technology to transform the world around us. What began as a simple curiosity quickly blossomed into a deep passion for problem-solving and innovation. Through [specific project or class], I discovered that computer science is not just about writing code; it is about creating meaningful solutions that make a real difference in people's lives.

At [University Name], I am eager to delve deeper into fields like artificial intelligence and human-computer interaction. I am particularly drawn to [specific program or professor], which aligns perfectly with my goal of building accessible technology. Ultimately, I believe that studying computer science will empower me to turn my passion into purpose and contribute to a brighter, more connected future.`,
  },
  {
    id: "c07-blog-productivity",
    genre: "blog post",
    tone: "casual",
    prompt: "Write a productivity blog intro in typical AI-assistant style, about 140 words.",
    text: `Have you ever wondered why some people seem to get so much done while others struggle to keep up? The secret isn't working longer hours ${EM} it's working smarter. In this fast-paced world, productivity has become more than just a buzzword; it's an essential skill for success in both our personal and professional lives.

The good news is that boosting your productivity doesn't require a complete overhaul of your routine. Small, intentional changes can have a profound impact on how you manage your time and energy. From prioritizing your most important tasks to minimizing distractions and building sustainable habits, there are countless strategies you can implement today.

In this post, we'll explore five proven techniques that can help you unlock your full potential and reclaim control of your day.`,
  },
  {
    id: "c08-history-railroads",
    genre: "history essay",
    tone: "academic",
    prompt: "Write an academic-style paragraph about the transcontinental railroad in typical AI-assistant style, about 150 words.",
    text: `The completion of the first transcontinental railroad in 1869 stands as a testament to American ambition and ingenuity. Connecting the eastern rail network to the Pacific coast, the railroad dramatically reduced travel time across the continent from months to roughly a week. This monumental achievement not only facilitated the movement of goods and people but also played a crucial role in shaping the economic landscape of the nation. However, it is essential to acknowledge that this progress came at a profound human cost. Thousands of Chinese immigrants endured grueling conditions and discrimination while building the Central Pacific line, and the railroad accelerated the displacement of Native American communities. Thus, the legacy of the transcontinental railroad is a complex tapestry of innovation, exploitation, and transformation that continues to shape our understanding of the period.`,
  },
  {
    id: "c09-linkedin-promotion",
    genre: "social post",
    tone: "professional",
    prompt: "Write a LinkedIn post announcing a promotion in typical AI-assistant style, about 120 words.",
    text: `I'm thrilled to share that I've been promoted to Senior Product Manager at Brightline Health!

This journey has been nothing short of transformative. Over the past three years, I've had the privilege of working alongside an incredibly talented team, tackling complex challenges and delivering products that truly make a difference in patients' lives.

None of this would have been possible without the unwavering support of my mentors, colleagues, and friends. A special thank you to Dana Whitfield for believing in me and pushing me to grow every single day.

As I step into this new role, I'm excited to continue driving innovation, fostering collaboration, and building solutions that matter. Here's to the next chapter!

#Leadership #ProductManagement #Growth`,
  },
  {
    id: "c10-explainer-compound",
    genre: "explainer",
    tone: "neutral",
    prompt: "Explain compound interest to a beginner in typical AI-assistant style, about 140 words.",
    text: `Compound interest is one of the most powerful concepts in personal finance, and understanding it can transform the way you think about saving. At its core, compound interest means earning interest not only on your original deposit but also on the interest you've already earned. Over time, this creates a snowball effect that can significantly accelerate the growth of your money.

For example, imagine you invest $1,000 at an annual interest rate of 5%. After the first year, you'll have $1,050. In the second year, you earn 5% on $1,050, not just the original $1,000, bringing your total to $1,102.50. While the difference may seem small at first, it becomes substantial over decades.

The key takeaway? Start saving early, stay consistent, and let time do the heavy lifting.`,
  },
  {
    id: "c11-review-cafe",
    genre: "review",
    tone: "casual",
    prompt: "Write a cafe review in typical AI-assistant style, about 120 words.",
    text: `Nestled in the heart of downtown, The Daily Grind is a true hidden gem for coffee lovers. From the moment you step inside, you're greeted by the warm aroma of freshly roasted beans and a cozy, inviting atmosphere. The baristas are not only friendly but also genuinely passionate about their craft, taking the time to recommend drinks tailored to your taste.

I ordered the lavender oat latte, and it was nothing short of exceptional ${EM} perfectly balanced, smooth, and subtly sweet. The pastries, baked fresh every morning, are equally impressive. Whether you're looking for a quiet place to work or a spot to catch up with friends, The Daily Grind delivers an experience that keeps you coming back for more.`,
  },
  {
    id: "c12-memo-security",
    genre: "internal memo",
    tone: "professional",
    prompt: "Write an internal memo about mandatory security training in typical AI-assistant style, about 130 words.",
    text: `As part of our ongoing commitment to safeguarding our organization, all employees are required to complete the annual cybersecurity awareness training by November 15. In an era where cyber threats are becoming increasingly sophisticated, it is crucial that every team member understands their role in protecting sensitive information.

The training consists of four short modules covering phishing, password management, data handling, and incident reporting. It takes approximately 45 minutes to complete and can be accessed through the Learning Portal at any time. Employees who complete the training will also receive a certificate for their records.

We appreciate your cooperation in helping us maintain a secure and resilient workplace. If you have any questions, please feel free to reach out to the IT Security team.`,
  },
];
