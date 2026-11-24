import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import {
  createComment,
  createEnquiry,
  createNotification,
  createPost,
  createUserWithSkills,
  findUserByEmail,
  getAllCategories,
  getAllSkills,
  getEnquiriesForCustomer,
  getFeedPosts,
  togglePostLike,
  updateEnquiryStatus,
  updateUserProfile,
} from './db.ts';
import { POST_UPLOAD_DIR, POST_URL_PREFIX } from './imageUtils.ts';

interface SeedAccountSpec {
  roleLabel: string;
  fullName: string;
  email: string;
  province: string;
  city: string;
  suburb: string;
  bio: string;
  hasSkills: boolean;
  skillNames: string[];
  customSkills: string[];
  skillDescription: string;
  serviceLocation: string;
}

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD?.trim() || 'LocalPro#Demo2026!';

const SEED_ACCOUNTS: SeedAccountSpec[] = [
  {
    roleLabel: 'Service Provider — Plumber',
    fullName: 'Sipho Mthembu',
    email: 'sipho.mthembu@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    suburb: 'Glenwood',
    bio: 'Qualified residential and commercial plumber serving Glenwood, Berea, and greater Durban. Clean pipework, geyser installations, and leak detection.',
    hasSkills: true,
    skillNames: ['Plumber'],
    customSkills: ['Geyser installations'],
    skillDescription:
      'Copper and PEX pipe installations, burst pipe repairs, pressure valve replacements, bathroom renovations, and emergency leak callouts across Durban.',
    serviceLocation: 'Glenwood, Durban, KwaZulu-Natal',
  },
  {
    roleLabel: 'Service Provider — Nail technician',
    fullName: 'Naledi Dlamini',
    email: 'naledi.dlamini@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Umhlanga',
    suburb: 'Umhlanga Ridge',
    bio: 'Certified nail technician specialising in BIAB overlays, soft gel extensions, and custom hand-painted nail art in Umhlanga Ridge.',
    hasSkills: true,
    skillNames: ['Nail technician'],
    customSkills: ['Gel-X extensions'],
    skillDescription:
      'Studio and mobile bridal nail appointments using salon-grade UV gels, sterile tools, and gentle soak-off care across Umhlanga and Durban North.',
    serviceLocation: 'Umhlanga Ridge, Umhlanga, KwaZulu-Natal',
  },
  {
    roleLabel: 'Service Provider — Mechanic',
    fullName: 'Kobus van der Merwe',
    email: 'kobus.auto@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Pinetown',
    suburb: 'New Germany',
    bio: '14 years keeping bakkies, sedans, and delivery vans running reliably in Pinetown and Westville. Honest diagnostics and transparent servicing.',
    hasSkills: true,
    skillNames: ['Mechanic'],
    customSkills: ['Diagnostic scanning'],
    skillDescription:
      'Major and minor servicing, brake overhauls, suspension work, clutch replacements, and pre-purchase vehicle inspections in New Germany and Highway area.',
    serviceLocation: 'New Germany, Pinetown, KwaZulu-Natal',
  },
  {
    roleLabel: 'Service Provider — Graphic designer',
    fullName: 'Ayanda Nkosi',
    email: 'ayanda.nkosi@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Pietermaritzburg',
    suburb: 'Scottsville',
    bio: 'Brand identity and digital layout designer helping KZN small businesses look sharp online and in print.',
    hasSkills: true,
    skillNames: ['Graphic designer', 'Web developer'],
    customSkills: ['Brand identity'],
    skillDescription:
      'Logo systems, business cards, social media launch kits, packaging labels, and clean responsive landing pages for local entrepreneurs.',
    serviceLocation: 'Scottsville, Pietermaritzburg, KwaZulu-Natal',
  },
  {
    roleLabel: 'Service Provider — Photographer',
    fullName: 'Thabo Cele',
    email: 'thabo.cele@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Ballito',
    suburb: 'Salt Rock',
    bio: 'Natural-light portrait, event, and small-business brand photographer working along the Dolphin Coast and Durban beachfront.',
    hasSkills: true,
    skillNames: ['Photographer', 'Videographer'],
    customSkills: ['Event coverage'],
    skillDescription:
      'Editorial portraits, family beach sessions, corporate headshots, product photography, and highlight reels from Ballito to Durban Central.',
    serviceLocation: 'Salt Rock, Ballito, KwaZulu-Natal',
  },
  {
    roleLabel: 'Service Provider — Tutor',
    fullName: 'Priya Naidoo',
    email: 'priya.naidoo@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Richards Bay',
    suburb: 'Meerensee',
    bio: 'High school Mathematics and Physical Sciences tutor helping Grade 8–12 learners build confidence for term assessments and matric exams.',
    hasSkills: true,
    skillNames: ['Tutor', 'Academic assistance'],
    customSkills: ['Matric exam prep'],
    skillDescription:
      'One-on-one and small-group afternoon tutoring in Mathematics, Physical Sciences, and study skills in Richards Bay or via live video.',
    serviceLocation: 'Meerensee, Richards Bay, KwaZulu-Natal',
  },
  {
    roleLabel: 'Browsing-only User (No Skills)',
    fullName: 'Lindiwe Khumalo',
    email: 'lindiwe.khumalo@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    suburb: 'Morningside',
    bio: 'Homeowner in Morningside looking for reliable local tradespeople and creatives around Durban.',
    hasSkills: false,
    skillNames: [],
    customSkills: [],
    skillDescription: '',
    serviceLocation: 'Morningside, Durban, KwaZulu-Natal',
  },
  {
    roleLabel: 'Customer Account (Submits Enquiries)',
    fullName: 'David Govender',
    email: 'david.govender@localpro-demo.za',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    suburb: 'Westville',
    bio: 'Small guesthouse coordinator in Westville connecting with skilled KZN service providers for maintenance and events.',
    hasSkills: false,
    skillNames: [],
    customSkills: [],
    skillDescription: '',
    serviceLocation: 'Westville, Durban, KwaZulu-Natal',
  },
];

function copyAssetImageToPosts(sourceFilename: string, targetFilename: string): string | null {
  const sourcePath = path.resolve(process.cwd(), 'src', 'assets', 'images', sourceFilename);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`Seed warning: asset image not found at ${sourcePath}`);
    return null;
  }
  const targetPath = path.resolve(POST_UPLOAD_DIR, targetFilename);
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return `${POST_URL_PREFIX}${targetFilename}`;
}

async function main() {
  console.log('Seeding LocalPro KZN demonstration dataset...');

  const skillsByName = new Map(getAllSkills().map((s) => [s.name.toLowerCase(), s.id]));
  const categoriesByName = new Map(getAllCategories().map((c) => [c.name.toLowerCase(), c.id]));

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIdByEmail = new Map<string, string>();

  for (const spec of SEED_ACCOUNTS) {
    const existing = findUserByEmail(spec.email);
    const skillIds = spec.skillNames
      .map((name) => skillsByName.get(name.toLowerCase()))
      .filter((id): id is number => typeof id === 'number');

    if (existing) {
      userIdByEmail.set(spec.email, existing.id);
      console.log(`- Account exists: ${spec.fullName} (${spec.email})`);
    } else {
      const userId = crypto.randomUUID();
      createUserWithSkills({
        id: userId,
        fullName: spec.fullName,
        email: spec.email,
        passwordHash,
        province: spec.province,
        city: spec.city,
        suburb: spec.suburb,
        hasSkills: spec.hasSkills,
        skillDescription: spec.skillDescription,
        skillIds,
        customSkills: spec.customSkills,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      });
      updateUserProfile({
        userId,
        fullName: spec.fullName,
        bio: spec.bio,
        province: spec.province,
        city: spec.city,
        suburb: spec.suburb,
        serviceLocation: spec.serviceLocation,
        hasSkills: spec.hasSkills,
        skillDescription: spec.skillDescription,
        skillIds,
        customSkills: spec.customSkills,
      });
      userIdByEmail.set(spec.email, userId);
      console.log(`+ Created ${spec.roleLabel}: ${spec.fullName} (${spec.email})`);
    }
  }

  const plumberId = userIdByEmail.get('sipho.mthembu@localpro-demo.za')!;
  const nailsId = userIdByEmail.get('naledi.dlamini@localpro-demo.za')!;
  const mechanicId = userIdByEmail.get('kobus.auto@localpro-demo.za')!;
  const designerId = userIdByEmail.get('ayanda.nkosi@localpro-demo.za')!;
  const photographerId = userIdByEmail.get('thabo.cele@localpro-demo.za')!;
  const tutorId = userIdByEmail.get('priya.naidoo@localpro-demo.za')!;
  const browserId = userIdByEmail.get('lindiwe.khumalo@localpro-demo.za')!;
  const customerId = userIdByEmail.get('david.govender@localpro-demo.za')!;

  const postSpecs = [
    {
      authorId: plumberId,
      categoryName: 'Construction and Home Services',
      description:
        'Completed a neat copper manifold and pressure-valve replacement in Glenwood this morning. Zero drips and tidy pipe runs ready for years of reliable hot water.',
      province: 'KwaZulu-Natal',
      city: 'Durban',
      suburb: 'Glenwood',
      priceText: 'From R850 callout',
      assetFile: 'demo_plumbing_work_1795442692460.jpg',
      uploadFile: 'demo-plumbing-glenwood.jpg',
      hoursAgo: 5,
    },
    {
      authorId: nailsId,
      categoryName: 'Beauty',
      description:
        'Fresh pearl-white BIAB French tips with delicate hand-painted floral accents completed at my Umhlanga Ridge studio today. Gentle prep and long-lasting finish.',
      province: 'KwaZulu-Natal',
      city: 'Umhlanga',
      suburb: 'Umhlanga Ridge',
      priceText: 'R420 full set',
      assetFile: 'demo_nails_work_1795442692095.jpg',
      uploadFile: 'demo-nails-umhlanga.jpg',
      hoursAgo: 9,
    },
    {
      authorId: mechanicId,
      categoryName: 'Automotive',
      description:
        'Full 90,000 km major service, timing belt inspection, and diagnostic health check wrapped up in our New Germany workshop. Ready for another reliable KZN road trip.',
      province: 'KwaZulu-Natal',
      city: 'Pinetown',
      suburb: 'New Germany',
      priceText: 'R1,450 – R2,800',
      assetFile: 'demo_mechanic_work_1795442693145.jpg',
      uploadFile: 'demo-mechanic-pinetown.jpg',
      hoursAgo: 14,
    },
    {
      authorId: designerId,
      categoryName: 'Technology',
      description:
        'Brand identity kit, signage mockup, and social launch templates wrapped up for a new Pietermaritzburg hospitality venture. Built cleanly for both print and web.',
      province: 'KwaZulu-Natal',
      city: 'Pietermaritzburg',
      suburb: 'Scottsville',
      priceText: 'From R1,800 package',
      assetFile: 'localpro_tech_studio_1795438668049.jpg',
      uploadFile: 'demo-design-pmb.jpg',
      hoursAgo: 20,
    },
    {
      authorId: photographerId,
      categoryName: 'Creative Services',
      description:
        'Golden-hour small-business portrait session along the Durban Golden Mile promenade. Natural coastal light makes every local entrepreneur stand out effortlessly.',
      province: 'KwaZulu-Natal',
      city: 'Ballito',
      suburb: 'Salt Rock',
      priceText: 'R1,200 per 1-hour shoot',
      assetFile: 'demo_photography_work_1795442955845.jpg',
      uploadFile: 'demo-photography-durban.jpg',
      hoursAgo: 28,
    },
    {
      authorId: tutorId,
      categoryName: 'Education',
      description:
        'Term 2 Grade 11 & 12 Mathematics and Physical Sciences revision slots open in Meerensee, Richards Bay. Structured past-paper practice and step-by-step concept coaching.',
      province: 'KwaZulu-Natal',
      city: 'Richards Bay',
      suburb: 'Meerensee',
      priceText: 'R240 per hour',
      assetFile: null,
      uploadFile: null,
      hoursAgo: 36,
    },
  ];

  const createdPostIds: string[] = [];

  for (const spec of postSpecs) {
    const existingPosts = getFeedPosts({
      viewerUserId: spec.authorId,
      viewerProvince: 'KwaZulu-Natal',
      viewerCity: 'Durban',
      viewerSuburb: '',
      scope: 'everywhere',
      authorId: spec.authorId,
      sort: 'recent',
      limit: 5,
      offset: 0,
    });

    if (existingPosts.posts.length > 0) {
      createdPostIds.push(existingPosts.posts[0].id);
      continue;
    }

    const categoryId = categoriesByName.get(spec.categoryName.toLowerCase()) ?? 1;
    const images: string[] = [];
    if (spec.assetFile && spec.uploadFile) {
      const url = copyAssetImageToPosts(spec.assetFile, spec.uploadFile);
      if (url) images.push(url);
    }

    const post = createPost({
      id: crypto.randomUUID(),
      authorId: spec.authorId,
      categoryId,
      description: spec.description,
      province: spec.province,
      city: spec.city,
      suburb: spec.suburb,
      priceText: spec.priceText,
      images,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * spec.hoursAgo).toISOString(),
    });
    createdPostIds.push(post.id);
    console.log(`+ Seeded post in ${spec.city} (${spec.categoryName})`);
  }

  // Seed sample likes, comments, and notifications if the plumber post has 0 likes yet
  if (createdPostIds.length >= 3) {
    const plumberPostId = createdPostIds[0];
    const nailsPostId = createdPostIds[1];
    const mechanicPostId = createdPostIds[2];

    const feedCheck = getFeedPosts({
      viewerUserId: customerId,
      viewerProvince: 'KwaZulu-Natal',
      viewerCity: 'Durban',
      viewerSuburb: '',
      scope: 'everywhere',
      authorId: plumberId,
      sort: 'recent',
      limit: 1,
      offset: 0,
    });

    if (feedCheck.posts[0] && feedCheck.posts[0].likeCount === 0) {
      togglePostLike(customerId, plumberPostId);
      togglePostLike(browserId, plumberPostId);
      togglePostLike(customerId, nailsPostId);
      togglePostLike(browserId, mechanicPostId);

      createComment({
        id: crypto.randomUUID(),
        postId: plumberPostId,
        userId: customerId,
        commentText: 'Super neat pipework! Do you also service Westville?',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      });

      createComment({
        id: crypto.randomUUID(),
        postId: nailsPostId,
        userId: browserId,
        commentText: 'The pearl finish is stunning — booking for next weekend!',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      });

      createNotification({
        id: crypto.randomUUID(),
        recipientUserId: plumberId,
        actorUserId: customerId,
        type: 'post_like',
        relatedPostId: plumberPostId,
        message: 'David Govender liked your showcased work post.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3.5).toISOString(),
      });

      createNotification({
        id: crypto.randomUUID(),
        recipientUserId: plumberId,
        actorUserId: customerId,
        type: 'post_comment',
        relatedPostId: plumberPostId,
        message: 'David Govender commented on your post.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      });

      console.log('+ Seeded sample likes, comments, and post notifications');
    }
  }

  // Seed sample enquiries and enquiry notifications if customer has none yet
  const existingCustomerEnquiries = getEnquiriesForCustomer(customerId);
  if (existingCustomerEnquiries.length === 0) {
    const t1 = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
    const pendingEnquiry = createEnquiry({
      id: crypto.randomUUID(),
      customerId,
      providerId: plumberId,
      serviceRequested: 'Plumber',
      description:
        'Need a quote to replace a leaking geyser pressure-control valve and inspect copper inlet piping at our Westville guesthouse.',
      customerLocation: 'Westville, Durban, KwaZulu-Natal',
      preferredDate: '2026-11-28',
      additionalInfo: 'Gate access available from 08:30 onwards.',
      createdAt: t1,
    });

    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: plumberId,
      actorUserId: customerId,
      type: 'enquiry_received',
      relatedEnquiryId: pendingEnquiry.id,
      message: 'David Govender sent you an enquiry for Plumber.',
      createdAt: t1,
    });

    const t2Created = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const t2Updated = new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString();
    const acceptedEnquiry = createEnquiry({
      id: crypto.randomUUID(),
      customerId,
      providerId: nailsId,
      serviceRequested: 'Nail technician',
      description:
        'Looking for bridal-party gel nail appointments for three guests on Saturday morning.',
      customerLocation: 'Westville, Durban, KwaZulu-Natal',
      preferredDate: '2026-12-05',
      additionalInfo: 'Soft neutral French manicure style.',
      createdAt: t2Created,
    });
    updateEnquiryStatus(acceptedEnquiry.id, 'Accepted', t2Updated);

    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: customerId,
      actorUserId: nailsId,
      type: 'enquiry_accepted',
      relatedEnquiryId: acceptedEnquiry.id,
      message: 'Naledi Dlamini accepted your enquiry for Nail technician.',
      createdAt: t2Updated,
    });

    const t3Created = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString();
    const t3Updated = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    const completedEnquiry = createEnquiry({
      id: crypto.randomUUID(),
      customerId,
      providerId: mechanicId,
      serviceRequested: 'Mechanic',
      description: 'Annual service and front brake pad check for 2019 Toyota Hilux.',
      customerLocation: 'Westville, Durban, KwaZulu-Natal',
      preferredDate: '2026-11-20',
      additionalInfo: 'Completed cleanly — thank you!',
      createdAt: t3Created,
    });
    updateEnquiryStatus(completedEnquiry.id, 'Completed', t3Updated);

    createNotification({
      id: crypto.randomUUID(),
      recipientUserId: customerId,
      actorUserId: mechanicId,
      type: 'enquiry_completed',
      relatedEnquiryId: completedEnquiry.id,
      message: 'Kobus van der Merwe marked your enquiry for Mechanic as completed.',
      createdAt: t3Updated,
      isRead: true,
    });

    console.log('+ Seeded sample customer/provider enquiries and notifications');
  }

  console.log('LocalPro KZN demonstration dataset ready.');
}

main().catch((err) => {
  console.error('Failed to seed LocalPro demo dataset:', err);
  process.exit(1);
});
