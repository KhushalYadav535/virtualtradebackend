const { z } = require('zod');
const adminExtended = require('../services/adminExtended');

const ticketSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(5000)
});

const createTicket = async (req, res, next) => {
  try {
    const { subject, body } = ticketSchema.parse(req.body);
    const ticket = await adminExtended.createTicket(req.user.id, subject, body);
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
};

const listTickets = async (req, res, next) => {
  try {
    const tickets = await adminExtended.listUserTickets(req.user.id);
    res.json(tickets);
  } catch (err) {
    next(err);
  }
};

module.exports = { createTicket, listTickets };
